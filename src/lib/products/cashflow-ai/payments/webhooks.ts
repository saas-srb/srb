import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { getPaymentProvider, PaymentProviderId } from "./provider";
import "./providers";
import { getPaymentIntent, getPaymentIntentByGatewayOrder, markPaymentIntentSuccessful, markPaymentIntentFailed } from "./intents";
import type { PaymentMethod } from "./intents";
import { resolveRazorpayCredentials } from "@/lib/platform/integrations/payments";

interface RazorpayEventPayload {
  payment?: { entity?: { id?: string; order_id?: string; method?: string; error_description?: string; acquirer_data?: { rrn?: string; upi_transaction_id?: string } } };
  order?: { entity?: { id?: string } };
}

export const WEBHOOK_EVENTS_COLLECTION = "fms_webhook_events";

export interface WebhookEventRecord {
  _id: string;
  providerEventId: string;
  provider: PaymentProviderId;
  eventType: string;
  payload: Record<string, unknown>;
  processedAt: Date;
  status: "PROCESSED" | "IGNORED" | "FAILED";
  error?: string;
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<WebhookEventRecord>(WEBHOOK_EVENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ providerEventId: 1, provider: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ processedAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function processPaymentWebhook(
  providerId: PaymentProviderId,
  rawBody: string,
  signature: string,
  /** The gateway's event id header (Razorpay: `x-razorpay-event-id`) — its payload has none, so this is what de-duplicates retries. */
  headerEventId?: string | null
): Promise<{ ok: boolean; status: number; message: string }> {
  if (providerId === "razorpay") {
    // Verified with THIS company's webhook secret. The company is the current
    // scope: the id in the per-company webhook URL (runAsCompany), or the Host
    // for the legacy URL. No secret → reject.
    const secret = (await resolveRazorpayCredentials("payments"))?.webhookSecret;
    if (!secret) return { ok: false, status: 400, message: "Webhooks aren't configured for this workspace" };
    if (!getPaymentProvider("razorpay").verifyWebhookSignature(rawBody, signature, secret)) {
      return { ok: false, status: 400, message: "Invalid webhook signature" };
    }
  } else {
    return { ok: false, status: 404, message: "Unsupported payment provider" };
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, message: "Invalid JSON payload" };
  }

  const providerEventId = (headerEventId || body.event_id || body.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`) as string;
  const eventType = (body.event || body.type || "payment.captured") as string;

  const collection = await getCollection();
  const existing = await collection.findOne({ providerEventId, provider: providerId });
  if (existing) {
    return { ok: true, status: 200, message: "Duplicate webhook event ignored" };
  }

  const logDoc: WebhookEventRecord = {
    _id: newId(),
    providerEventId,
    provider: providerId,
    eventType,
    payload: body,
    processedAt: new Date(),
    status: "PROCESSED",
  };

  try {
    if (providerId === "razorpay") {
      const payloadObj = body.payload as RazorpayEventPayload | undefined;
      if (eventType === "payment.captured" || eventType === "order.paid") {
        const paymentEntity = payloadObj?.payment?.entity;
        const orderId = paymentEntity?.order_id || payloadObj?.order?.entity?.id;
        const paymentId = paymentEntity?.id;
        const utr = paymentEntity?.acquirer_data?.rrn || paymentEntity?.acquirer_data?.upi_transaction_id;

        if (orderId) {
          const intent = await getPaymentIntentByGatewayOrder(orderId);
          if (intent) {
            await markPaymentIntentSuccessful(intent._id, {
              gatewayPaymentId: paymentId,
              utr,
              paymentMethod: paymentEntity?.method?.toUpperCase() as PaymentMethod | undefined,
            });
          }
        }
      } else if (eventType === "payment.failed") {
        const paymentEntity = payloadObj?.payment?.entity;
        const orderId = paymentEntity?.order_id;
        if (orderId) {
          const intent = await getPaymentIntentByGatewayOrder(orderId);
          if (intent) {
            await markPaymentIntentFailed(intent._id, paymentEntity?.error_description || "Razorpay Payment Failed");
          }
        }
      }
    }

    await collection.insertOne(logDoc);
    await recordAudit({
      actorId: "system",
      actorEmail: "webhook@internal.invalid",
      action: "webhook_received",
      entity: "webhook_event",
      entityId: logDoc._id,
      entityLabel: providerEventId,
      summary: `Processed webhook event ${eventType} for ${providerId}`,
    });

    return { ok: true, status: 200, message: "Webhook processed successfully" };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logDoc.status = "FAILED";
    logDoc.error = errorMsg;
    await collection.insertOne(logDoc);
    return { ok: false, status: 500, message: `Webhook processing error: ${errorMsg}` };
  }
}
