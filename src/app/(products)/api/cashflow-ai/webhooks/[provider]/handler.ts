import { NextResponse } from "next/server";
import { limitOr429 } from "@/lib/security/rate-limit";
import { unstable_rethrow } from "next/navigation";
import { processPaymentWebhook } from "@/lib/products/cashflow-ai/payments/webhooks";
import type { PaymentProviderId } from "@/lib/products/cashflow-ai/payments/provider";

/**
 * Shared by the host-based route (`/api/cashflow-ai/webhooks/<provider>`) and the
 * per-company one (`/api/cashflow-ai/webhooks/<provider>/<companyId>`). The caller
 * decides which company this runs for; the signature is then checked with
 * that company's webhook secret.
 */
export async function handlePaymentWebhook(req: Request, provider: string): Promise<Response> {
  // A webhook is a small JSON message: anything large, or any flood from one address, is refused before it is read or checked.
  if (Number(req.headers.get("content-length") ?? 0) > 262_144) return NextResponse.json({ error: "Too large." }, { status: 413 });
  const limited = await limitOr429(req, "rzp-payment-webhook", 300, 60);
  if (limited) return limited;
  try {
    if (provider !== "razorpay") return NextResponse.json({ ok: false, error: "Unsupported payment provider" }, { status: 404 });
    const providerId: PaymentProviderId = "razorpay";
    const rawBody = await req.text();
    if (rawBody.length > 262_144) return NextResponse.json({ ok: false, error: "Too large." }, { status: 413 });
    const signature = req.headers.get("x-razorpay-signature") || "";
    const eventId = req.headers.get("x-razorpay-event-id");

    const res = await processPaymentWebhook(providerId, rawBody, signature, eventId);
    return NextResponse.json({ ok: res.ok, message: res.message }, { status: res.status });
  } catch (err: unknown) {
    // notFound() from an unknown host must stay a 404, not become a 500.
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
