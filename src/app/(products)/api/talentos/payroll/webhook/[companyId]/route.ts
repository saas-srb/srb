import { NextRequest, NextResponse } from "next/server";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { resolveWebhookCompany } from "@/lib/platform/integrations/payments";
import { handlePayoutWebhook } from "../handler";

/**
 * Per-company RazorpayX payout webhook — the URL Settings → Payments &
 * payouts shows. The company comes from the path (not the Host), and the
 * webhook runs inside its scope: its webhook secret verifies the signature,
 * its payouts are updated. The id isn't a secret; the signature is the
 * authentication.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const id = await resolveWebhookCompany(companyId);
  if (!id) return NextResponse.json({ error: "Unknown workspace" }, { status: 404 });
  return runAsCompany(id, () => handlePayoutWebhook(req));
}
