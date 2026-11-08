import { NextResponse } from "next/server";
import { limitOr429 } from "@/lib/security/rate-limit";
import { getPayoutProvider } from "@/lib/products/talentos/payout-provider";
import { applyWebhookResult } from "@/lib/products/talentos/salary-payouts";
import { applyPayoutEvent } from "@/lib/products/cashflow-ai/payments/payouts";

/**
 * Payout-provider webhook (RazorpayX), shared by the host-based and the
 * per-company route; the caller decides which company this runs for. The
 * signature is checked with that company's webhook secret; a company without
 * payouts connected gets 404, a bad/missing signature 400. The raw body is
 * needed for signature verification, so it is read as text before parsing.
 */
export async function handlePayoutWebhook(req: Request): Promise<Response> {
  // A webhook is a small JSON message: anything large, or any flood from one address, is refused before it is read or checked.
  if (Number(req.headers.get("content-length") ?? 0) > 262_144) return NextResponse.json({ error: "Too large." }, { status: 413 });
  const limited = await limitOr429(req, "rzp-payout-webhook", 300, 60);
  if (limited) return limited;
  const provider = await getPayoutProvider();
  if (provider.key === "manual") {
    return NextResponse.json({ error: "No payout provider configured." }, { status: 404 });
  }

  const raw = await req.text();
  if (raw.length > 262_144) return NextResponse.json({ error: "Too large." }, { status: 413 });
  const signature = req.headers.get("x-razorpay-signature");
  if (!provider.verifyWebhook(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON." }, { status: 400 });
  }

  const result = provider.parseWebhook(json);
  if (result) {
    // A salary payout, or any other payment made from CashFlow: the same RazorpayX account reports both.
    if (!(await applyWebhookResult(result))) await applyPayoutEvent(result);
  }
  // Always 200 so the provider stops retrying handled events.
  return NextResponse.json({ ok: true });
}
