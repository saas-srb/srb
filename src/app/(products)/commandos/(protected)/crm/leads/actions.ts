"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { updateLead, deleteLead, isValidCategory, validateLeadUpdate, type CategorySlug } from "@/lib/leads";

function revalidate() {
  revalidatePath("/commandos/crm/leads");
}

export async function updateLeadStatusAction(
  category: string,
  id: string,
  status: string
): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspaceAction("manage.crm.leads");
  if (!isValidCategory(category)) return { ok: false, error: "Invalid category." };

  const validation = validateLeadUpdate({ status });
  if (!validation.valid) return { ok: false, error: validation.errors.status ?? "Invalid status." };

  const result = await updateLead(category as CategorySlug, id, validation.data);
  revalidate();
  return { ok: result !== null };
}

export async function deleteLeadAction(category: string, id: string): Promise<{ ok: boolean; error?: string }> {
  await requireWorkspaceAction("manage.crm.leads");
  if (!isValidCategory(category)) return { ok: false, error: "Invalid category." };
  const ok = await deleteLead(category as CategorySlug, id);
  revalidate();
  return { ok };
}

/** `items` pairs a lead id with the category collection it lives in — a cross-category
 * selection can span multiple collections, so each id must carry its own category. */
export async function bulkUpdateLeadStatusAction(
  items: { id: string; category: string }[],
  status: string
): Promise<{ updated: number; error?: string }> {
  await requireWorkspaceAction("manage.crm.leads");
  const validation = validateLeadUpdate({ status });
  if (!validation.valid) return { updated: 0, error: validation.errors.status ?? "Invalid status." };

  let updated = 0;
  for (const item of items) {
    if (!isValidCategory(item.category)) continue;
    const result = await updateLead(item.category as CategorySlug, item.id, validation.data);
    if (result) updated += 1;
  }
  revalidate();
  return { updated };
}

export async function bulkDeleteLeadsAction(items: { id: string; category: string }[]): Promise<{ deleted: number }> {
  await requireWorkspaceAction("manage.crm.leads");
  let deleted = 0;
  for (const item of items) {
    if (!isValidCategory(item.category)) continue;
    const ok = await deleteLead(item.category as CategorySlug, item.id);
    if (ok) deleted += 1;
  }
  revalidate();
  return { deleted };
}
