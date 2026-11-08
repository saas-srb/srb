import { handlePaymentWebhook } from "./handler";

/**
 * Payment-gateway webhooks, host-based: the company comes from the Host
 * header like any request (an unknown host is a 404), and the signature is
 * checked against that company's webhook secret. Kept for URLs registered
 * before per-company webhook URLs existed (the platform owner's Razorpay
 * dashboard). New connections are shown `/api/cashflow-ai/webhooks/<provider>/<companyId>`
 * in Settings → Payments & payouts, which doesn't depend on the host.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  return handlePaymentWebhook(req, provider);
}
