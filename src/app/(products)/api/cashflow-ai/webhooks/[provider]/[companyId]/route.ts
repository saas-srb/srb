import { NextResponse } from "next/server";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { resolveWebhookCompany } from "@/lib/platform/integrations/payments";
import { handlePaymentWebhook } from "../handler";

/**
 * Per-company payment-gateway webhook — the URL Settings → Payments & payouts
 * shows. The company comes from the path (not the Host, so custom-domain
 * changes never break it), and the whole webhook runs inside that company's
 * scope: its webhook secret verifies the signature, its intents are updated.
 * The id isn't a secret; the signature is the authentication.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string; companyId: string }> }) {
  const { provider, companyId } = await params;
  const id = await resolveWebhookCompany(companyId);
  if (!id) return NextResponse.json({ ok: false, error: "Unknown workspace" }, { status: 404 });
  return runAsCompany(id, () => handlePaymentWebhook(req, provider));
}
