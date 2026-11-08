"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance } from "@/lib/fms-roles";
import { clearSectionOverride, removeSection, saveSection, setSectionUse } from "@/lib/products/cashflow-ai/tds/store";
import { parseSectionForm } from "@/lib/products/cashflow-ai/tds/section-input";

export type SectionActionResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function manager() {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageCompliance(user)) throw new Error("Forbidden");
  return user;
}

function refresh() {
  revalidatePath("/cashflow-ai/tds", "layout");
  revalidatePath("/spendiq/invoices", "layout");
}

export async function saveSectionAction(input: Record<string, unknown>): Promise<SectionActionResult> {
  const user = await manager();
  const parsed = parseSectionForm(input);
  if (!parsed.ok) return { ok: false, error: Object.values(parsed.errors)[0], fieldErrors: parsed.errors };
  const res = await saveSection(parsed.value, { id: user.id, email: user.email });
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

export async function removeSectionAction(code: string): Promise<SectionActionResult> {
  const user = await manager();
  const res = await removeSection(String(code ?? ""), { id: user.id, email: user.email });
  if (res.ok) refresh();
  return res;
}

/** "We pay under this section" on/off. The figures stay the platform's. */
export async function setSectionUseAction(code: string, active: boolean): Promise<SectionActionResult> {
  const user = await manager();
  const res = await setSectionUse(String(code ?? ""), active === true, { id: user.id, email: user.email });
  if (res.ok) refresh();
  return res;
}

export async function clearSectionOverrideAction(code: string): Promise<SectionActionResult> {
  const user = await manager();
  const res = await clearSectionOverride(String(code ?? ""), { id: user.id, email: user.email });
  if (res.ok) refresh();
  return res;
}
