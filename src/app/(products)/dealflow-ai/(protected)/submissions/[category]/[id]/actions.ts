"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLms } from "@/lib/lms-auth";
import type { LmsPermission } from "@/lib/lms-roles";
import { deleteLead, isValidCategory, updateLead, validateLeadUpdate, type CategorySlug } from "@/lib/leads";

// Every action here independently re-checks the session — the page that
// renders the form is already gated, but per Next's own guidance, render-time
// gating alone is not a security boundary for the action endpoint itself.
async function requireLmsUser(permission: LmsPermission) {
  const u = await requireLms(permission);
  if (!u) throw new Error("Forbidden");
  return u;
}

export async function updateStatusAction(category: string, id: string, status: string): Promise<{ error?: string }> {
  await requireLmsUser("EDIT_LEADS");
  if (!isValidCategory(category)) return { error: "Invalid category." };

  const validation = validateLeadUpdate({ status });
  if (!validation.valid) return { error: validation.errors.status ?? "Invalid status." };

  const updated = await updateLead(category as CategorySlug, id, validation.data);
  if (!updated) return { error: "Submission not found." };

  revalidatePath(`/dealflow-ai/submissions/${category}/${id}`);
  revalidatePath(`/dealflow-ai/submissions/${category}`);
  revalidatePath("/dealflow-ai");
  return {};
}

export async function updateDealValueAction(category: string, id: string, dealValue: string): Promise<{ error?: string }> {
  await requireLmsUser("EDIT_LEADS");
  if (!isValidCategory(category)) return { error: "Invalid category." };

  const validation = validateLeadUpdate({ dealValue: dealValue === "" ? null : dealValue });
  if (!validation.valid) return { error: validation.errors.dealValue ?? "Invalid amount." };

  const updated = await updateLead(category as CategorySlug, id, validation.data);
  if (!updated) return { error: "Submission not found." };

  revalidatePath(`/dealflow-ai/submissions/${category}/${id}`);
  revalidatePath("/dealflow-ai/campaigns");
  revalidatePath("/dealflow-ai/campaigns/leads");
  return {};
}

export async function updateNotesAction(category: string, id: string, notes: string): Promise<{ error?: string }> {
  await requireLmsUser("EDIT_LEADS");
  if (!isValidCategory(category)) return { error: "Invalid category." };

  const validation = validateLeadUpdate({ notes });
  if (!validation.valid) return { error: validation.errors.notes ?? "Invalid notes." };

  const updated = await updateLead(category as CategorySlug, id, validation.data);
  if (!updated) return { error: "Submission not found." };

  revalidatePath(`/dealflow-ai/submissions/${category}/${id}`);
  return {};
}

export async function deleteSubmissionAction(category: string, id: string): Promise<void> {
  await requireLmsUser("DELETE_LEADS");
  if (!isValidCategory(category)) throw new Error("Invalid category.");

  await deleteLead(category as CategorySlug, id);
  revalidatePath(`/dealflow-ai/submissions/${category}`);
  revalidatePath("/dealflow-ai");
  redirect(`/dealflow-ai/submissions/${category}`);
}

/** Same delete, but for callers already on the list (e.g. the row Sheet) that
 * want to close/refresh in place instead of being navigated. */
export async function deleteSubmissionInPlaceAction(category: string, id: string): Promise<{ error?: string }> {
  await requireLmsUser("DELETE_LEADS");
  if (!isValidCategory(category)) return { error: "Invalid category." };

  const deleted = await deleteLead(category as CategorySlug, id);
  if (!deleted) return { error: "Submission not found." };

  revalidatePath(`/dealflow-ai/submissions/${category}`);
  revalidatePath("/dealflow-ai");
  return {};
}
