"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLmsOrCms } from "@/lib/lms-auth";
import { validateOfferInput, type OfferWriteInput } from "@/lib/offers/offer-validation";
import { createOffer, updateOffer, deleteOffer, getOffer } from "@/lib/offers/offers";

async function requireLmsUser() {
  const u = await requireLmsOrCms("MANAGE_OFFERS", "PAGES_EDIT");
  if (!u) throw new Error("Forbidden");
  return u;
}

function touch(campaignId: string) {
  revalidatePath(`/sitecraft-ai/offers/${campaignId}`);
}

export async function saveOfferAction(
  campaignId: string,
  offerId: string | null,
  input: Partial<OfferWriteInput>
): Promise<{ error?: string; fieldErrors?: Record<string, string> }> {
  const user = await requireLmsUser();
  const validation = validateOfferInput({ ...input, campaignId });
  if (!validation.valid) return { error: "Please fix the highlighted fields.", fieldErrors: validation.errors };

  if (offerId) {
    const updated = await updateOffer(offerId, validation.data, user.id);
    if (!updated) return { error: "Offer not found." };
  } else {
    await createOffer(validation.data, user.id);
  }
  touch(campaignId);
  redirect(`/sitecraft-ai/offers/${campaignId}`);
}

export async function deleteOfferAction(campaignId: string, offerId: string): Promise<{ error?: string }> {
  const user = await requireLmsUser();
  const existing = await getOffer(offerId);
  if (!existing) return { error: "Offer not found." };
  await deleteOffer(offerId, user.id);
  touch(campaignId);
  return {};
}
