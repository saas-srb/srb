import { platformEvents } from "@/lib/notify/triggers/platform";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/platform/billing/razorpay";
import { billingWebhookSecret } from "@/lib/platform/billing/razorpay-config";
import { handleWebhook, type RazorpayWebhookPayload } from "@/lib/platform/billing/subscriptions";

/**
 * Razorpay webhook for PLATFORM subscription billing. Register
 * `https://<platform host>/api/platform/billing/webhook` in the platform
 * owner's Razorpay dashboard (the URL is shown in Platform Console → Payments &
 * Razorpay) with the webhook secret saved on the same page (else `RAZORPAY_BILLING_WEBHOOK_SECRET`). Events:
 * subscription.authenticated/activated/charged/pending/halted/cancelled/
 * completed/updated and payment.failed.
 * The raw body is verified before anything is parsed; events are idempotent
 * on `x-razorpay-event-id`. A processing failure answers 500 so Razorpay retries.
 */
export async function POST(req: NextRequest) {
  const secret = await billingWebhookSecret();
  if (!secret) return NextResponse.json({ error: "Billing webhook not configured" }, { status: 503 });

  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(raw) as RazorpayWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload || typeof payload.event !== "string") return NextResponse.json({ error: "Invalid event" }, { status: 400 });

  // Razorpay sends a unique id per event (same id on redelivery); fall back to the body hash.
  const eventId = req.headers.get("x-razorpay-event-id")?.trim() || `sha256:${createHash("sha256").update(raw).digest("hex")}`;
  try {
    const outcome = await handleWebhook(eventId, payload);
    return NextResponse.json({ ok: true, ...outcome });
  } catch (err) {
    console.error(`[billing] webhook ${eventId} (${payload.event}) failed`, err);
    await platformEvents.paymentWebhookFailed(`${payload.event}: ${err instanceof Error ? err.message : "processing failed"}`);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
