import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveRazorpayCredentials } from "@/lib/platform/integrations/payments";
import { limitOr429 } from "@/lib/security/rate-limit";
import type { PaymentMethod } from "@/lib/products/cashflow-ai/payments/intents";
import { getPaymentIntent, getPaymentIntentByGatewayPayment, markPaymentIntentSuccessful, markPaymentIntentFailed } from "@/lib/products/cashflow-ai/payments/intents";
import { getPaymentProvider } from "@/lib/products/cashflow-ai/payments/provider";
import { readSafeJson, UnsafeBodyError } from "@/lib/security/safe-json";

async function handlePOST(req: Request) {
  const limited = await limitOr429(req, "pay-verify", 40, 600);
  if (limited) return limited;
  try {
    let body: Record<string, unknown>;
    try {
      body = await readSafeJson(req);
    } catch (err) {
      if (err instanceof UnsafeBodyError) return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
      throw err;
    }
    const intentId = typeof body.intentId === "string" ? body.intentId : "";
    const gatewayPaymentId = typeof body.gatewayPaymentId === "string" ? body.gatewayPaymentId : undefined;
    const gatewaySignature = typeof body.gatewaySignature === "string" ? body.gatewaySignature : undefined;
    const utr = typeof body.utr === "string" ? body.utr.slice(0, 80) : undefined;
    const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.slice(0, 20) : undefined;

    if (!intentId) {
      return NextResponse.json({ ok: false, error: "Missing intentId" }, { status: 400 });
    }

    const intent = await getPaymentIntent(intentId);
    if (!intent) {
      return NextResponse.json({ ok: false, error: "Payment intent not found" }, { status: 404 });
    }

    if (intent.status === "SUCCESS") {
      return NextResponse.json({ ok: true, intent, message: "Payment already verified as successful" });
    }

    const provider = getPaymentProvider(intent.paymentProvider);
    if (gatewayPaymentId && typeof gatewayPaymentId === "string") {
      // Razorpay signs "order_id|payment_id" with the account's key secret when Checkout succeeds; a wrong signature is a forged claim.
      if (gatewaySignature) {
        const creds = await resolveRazorpayCredentials("payments");
        const expected = creds && intent.gatewayOrderId ? createHmac("sha256", creds.keySecret).update(`${intent.gatewayOrderId}|${gatewayPaymentId}`).digest("hex") : null;
        const given = Buffer.from(gatewaySignature);
        const want = expected ? Buffer.from(expected) : null;
        if (!want || want.length !== given.length || !timingSafeEqual(want, given)) {
          return NextResponse.json({ ok: false, error: "The payment signature does not match" }, { status: 400 });
        }
      }
      const statusRes = await provider.getPaymentStatus(gatewayPaymentId);
      // This route is public, so the gateway payment must be THIS intent's payment:
      // made against this intent's gateway order (the gateway fixes the order's
      // amount) and not already used to settle another intent. Otherwise any
      // captured payment on the account could mark any intent paid.
      if (statusRes.ok) {
        const paidOrder = statusRes.providerOrderId ?? null;
        const reused = await getPaymentIntentByGatewayPayment(gatewayPaymentId);
        if (!intent.gatewayOrderId || paidOrder !== intent.gatewayOrderId || (reused && reused._id !== intent._id)) {
          return NextResponse.json({ ok: false, error: "That payment doesn't belong to this payment request" }, { status: 400 });
        }
      }
      if (statusRes.ok && statusRes.status === "SUCCESS") {
        const markRes = await markPaymentIntentSuccessful(intentId, {
          gatewayPaymentId,
          gatewaySignature,
          utr: utr || statusRes.utr,
          paymentMethod: (paymentMethod || statusRes.paymentMethod) as PaymentMethod | undefined,
        });
        if (!markRes.ok) {
          // The webhook is booking this very payment at the same moment: give it a few seconds, then report what it did.
          for (let i = 0; i < 8; i++) {
            await new Promise((r) => setTimeout(r, 800));
            const now = await getPaymentIntent(intentId);
            if (now?.status === "SUCCESS") return NextResponse.json({ ok: true, intent: now });
          }
          return NextResponse.json({ ok: false, error: markRes.reason ?? "The payment is being confirmed. If money was deducted it will show shortly." });
        }
        return NextResponse.json({ ok: true, intent: markRes.intent });
      } else if (statusRes.ok && statusRes.status === "FAILED") {
        await markPaymentIntentFailed(intentId, statusRes.failureReason || "Payment verification failed");
        return NextResponse.json({ ok: false, error: "Payment failed at gateway" });
      }
    }

    return NextResponse.json({ ok: false, status: intent.status, message: "Payment pending completion" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
