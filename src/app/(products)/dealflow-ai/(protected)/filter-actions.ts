"use server";

import { requireLms } from "@/lib/lms-auth";
import { createSavedFilter, deleteSavedFilter } from "@/lib/saved-filters";

async function requireLmsUser(permission: string) {
  const u = await requireLms(permission);
  if (!u) throw new Error("Forbidden");
  return u;
}

export async function saveFilterAction(name: string, params: Record<string, string>): Promise<{ error?: string; id?: string }> {
  const lmsUser = await requireLmsUser("leads.view");
  if (!name.trim()) return { error: "Name is required." };
  const id = await createSavedFilter(lmsUser.id, name, params);
  return { id };
}

export async function deleteSavedFilterAction(id: string): Promise<{ error?: string }> {
  const lmsUser = await requireLmsUser("leads.view");
  const ok = await deleteSavedFilter(lmsUser.id, id);
  if (!ok) return { error: "Not found." };
  return {};
}
