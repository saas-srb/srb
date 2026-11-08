"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLmsOrCms } from "@/lib/lms-auth";
import { validateCampaignInput, type ReferralCampaignWriteInput } from "@/lib/wallet/campaign-validation";
import { createCampaign, updateCampaign, deleteCampaign, getCampaign } from "@/lib/wallet/campaigns";

async function requireLmsUser() {
  const u = await requireLmsOrCms("MANAGE_WALLET");
  if (!u) throw new Error("Forbidden");
  return u;
}

export async function saveCampaignAction(id: string | null, input: Partial<ReferralCampaignWriteInput>): Promise<{ error?: string; fieldErrors?: Record<string, string> }> {
  const user = await requireLmsUser();
  const v = validateCampaignInput(input);
  if (!v.valid) return { error: "Please fix the highlighted fields.", fieldErrors: v.errors };
  if (id) {
    if (!(await updateCampaign(id, v.data, user.id))) return { error: "Campaign not found." };
  } else {
    await createCampaign(v.data, user.id);
  }
  revalidatePath("/sitecraft-ai/wallet/campaigns");
  redirect("/sitecraft-ai/wallet/campaigns");
}

export async function toggleCampaignAction(id: string, isActive: boolean): Promise<{ error?: string }> {
  const user = await requireLmsUser();
  const c = await getCampaign(id);
  if (!c) return { error: "Campaign not found." };
  await updateCampaign(id, { name: c.name, isActive, qualifyingEvent: c.qualifyingEvent, referrerAudience: c.referrerAudience, maxReferralsPerReferrer: c.maxReferralsPerReferrer, startsAt: c.startsAt?.toISOString() ?? null, endsAt: c.endsAt?.toISOString() ?? null }, user.id);
  revalidatePath("/sitecraft-ai/wallet/campaigns");
  return {};
}

export async function deleteCampaignAction(id: string): Promise<{ error?: string }> {
  const user = await requireLmsUser();
  if (!(await getCampaign(id))) return { error: "Campaign not found." };
  await deleteCampaign(id, user.id);
  revalidatePath("/sitecraft-ai/wallet/campaigns");
  return {};
}
