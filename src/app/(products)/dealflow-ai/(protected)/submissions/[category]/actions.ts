"use server";

import { revalidatePath } from "next/cache";
import { requireLms } from "@/lib/lms-auth";
import type { LmsPermission } from "@/lib/lms-roles";
import { deleteLead, isValidCategory, updateLead, validateLeadUpdate, type CategorySlug } from "@/lib/leads";

async function requireLmsUser(permission: LmsPermission) {
  const u = await requireLms(permission);
  if (!u) throw new Error("Forbidden");
  return u;
}

export async function bulkUpdateStatusAction(
  category: string,
  ids: string[],
  status: string
): Promise<{ updated: number; error?: string }> {
  await requireLmsUser("EDIT_LEADS");
  if (!isValidCategory(category)) return { updated: 0, error: "Invalid category." };

  const validation = validateLeadUpdate({ status });
  if (!validation.valid) return { updated: 0, error: validation.errors.status ?? "Invalid status." };

  let updated = 0;
  for (const id of ids) {
    const result = await updateLead(category as CategorySlug, id, validation.data);
    if (result) updated += 1;
  }

  revalidatePath(`/dealflow-ai/submissions/${category}`);
  revalidatePath("/dealflow-ai");
  return { updated };
}

export async function bulkDeleteAction(category: string, ids: string[]): Promise<{ deleted: number; error?: string }> {
  await requireLmsUser("DELETE_LEADS");
  if (!isValidCategory(category)) return { deleted: 0, error: "Invalid category." };

  let deleted = 0;
  for (const id of ids) {
    const ok = await deleteLead(category as CategorySlug, id);
    if (ok) deleted += 1;
  }

  revalidatePath(`/dealflow-ai/submissions/${category}`);
  revalidatePath("/dealflow-ai");
  return { deleted };
}
