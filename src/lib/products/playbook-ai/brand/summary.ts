import "server-only";
import { playbookCan } from "@/lib/playbook-roles";
import { loadCompanyValues } from "@/lib/products/playbook-ai/brand/company-values";
import { presetById } from "@/lib/products/playbook-ai/brand/presets";
import { getBrand } from "@/lib/products/playbook-ai/brand/store";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";

export interface BrandSummary { company: string; style: string; hasLogo: boolean; canChange: boolean }

/** What the create flow shows about the letterhead the new document will use. */
export async function brandSummary(actor: PbActor): Promise<BrandSummary> {
  const [b, c] = await Promise.all([getBrand(), loadCompanyValues()]);
  return { company: String(c["company.legal_name"] ?? c["company.name"] ?? "Your company"), style: presetById(b.preset)?.label ?? "Custom", hasLogo: !!b.logo.assetId, canChange: playbookCan(actor, "MANAGE_BRAND") };
}
