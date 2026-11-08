import { NextRequest } from "next/server";
import { handlePayoutWebhook } from "./handler";

/**
 * Payout-provider webhook (RazorpayX), host-based: the company comes from the
 * Host header. Kept for URLs registered before per-company webhook URLs
 * existed (the platform owner's RazorpayX dashboard); Settings → Payments &
 * payouts shows `/api/talentos/payroll/webhook/<companyId>`, which doesn't depend
 * on the host.
 */
export async function POST(req: NextRequest) {
  return handlePayoutWebhook(req);
}
