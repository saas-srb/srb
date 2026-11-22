"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireGrowth, requireGrowthExport } from "@/lib/products/sitecraft-ai/growth";
import { validateCampaignInput, type CampaignWriteInput, type CampaignFaqInput } from "@/lib/offers/campaign-validation";
import { createCampaign, updateCampaign, deleteCampaign, getCampaign } from "@/lib/offers/campaigns";

async function requireLmsUser() {
  const u = await requireGrowth("offers");
  if (!u) throw new Error("Forbidden");
  return u;
}

function touch() {
  revalidatePath("/sitecraft-ai/offers");
}

export interface CampaignFormInput extends Omit<Partial<CampaignWriteInput>, "faqs"> {
  faqs?: CampaignFaqInput[];
}

export async function saveCampaignAction(
  id: string | null,
  input: CampaignFormInput
): Promise<{ error?: string; fieldErrors?: Record<string, string> }> {
  const user = await requireLmsUser();
  const validation = validateCampaignInput(input);
  if (!validation.valid) return { error: "Please fix the highlighted fields.", fieldErrors: validation.errors };

  if (id) {
    const updated = await updateCampaign(id, validation.data, user.id);
    if (!updated) return { error: "Campaign not found." };
  } else {
    await createCampaign(validation.data, user.id);
  }
  touch();
  redirect("/sitecraft-ai/offers");
}

export async function deleteCampaignAction(id: string): Promise<{ error?: string }> {
  const user = await requireLmsUser();
  const existing = await getCampaign(id);
  if (!existing) return { error: "Campaign not found." };
  await deleteCampaign(id, user.id);
  touch();
  return {};
}
