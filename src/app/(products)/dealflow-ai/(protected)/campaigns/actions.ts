"use server";

import { revalidatePath } from "next/cache";
import { requireLms } from "@/lib/lms-auth";
import type { LmsPermission } from "@/lib/lms-roles";
import { undoImport } from "@/lib/campaigns";
import { isValidPlatform } from "@/lib/campaign-platforms";
import { campaignKeyFor } from "@/lib/utm";
import { assignLeadsCampaign } from "@/lib/leads";
import { isValidCategory, type CategorySlug } from "@/lib/categories";

// Each action independently re-checks the session — render-time gating on the
// page is not a security boundary for the action endpoint itself.
async function requireLmsUser(permission: LmsPermission) {
  const u = await requireLms(permission);
  if (!u) throw new Error("Forbidden");
  return u;
}

export async function undoImportAction(importId: string): Promise<{ error?: string }> {
  await requireLmsUser("MANAGE_CAMPAIGNS");
  const result = await undoImport(importId);
  if (result.error) return { error: result.error };
  revalidatePath("/dealflow-ai/campaigns");
  revalidatePath("/dealflow-ai/campaigns/leads");
  revalidatePath("/dealflow-ai");
  return {};
}

export async function assignCampaignAction(
  targets: { category: string; id: string }[],
  source: string,
  campaignName: string
): Promise<{ updated: number; error?: string }> {
  await requireLmsUser("MANAGE_CAMPAIGNS");
  if (!isValidPlatform(source)) return { updated: 0, error: "Unknown platform." };
  const name = campaignName.trim().slice(0, 200);
  const valid = targets.filter((t): t is { category: CategorySlug; id: string } => isValidCategory(t.category));
  if (valid.length === 0) return { updated: 0, error: "No valid leads selected." };

  const updated = await assignLeadsCampaign(valid, source, name || undefined, campaignKeyFor(name));
  revalidatePath("/dealflow-ai/campaigns");
  revalidatePath("/dealflow-ai/campaigns/leads");
  revalidatePath("/dealflow-ai");
  return { updated };
}
