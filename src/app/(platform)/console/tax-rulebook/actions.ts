"use server";

import { revalidatePath } from "next/cache";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { confirmRulebook, resetRulebook, rulebookHistory, saveRulebook } from "@/lib/products/cashflow-ai/rulebook/rules-store";
import { formToRulebook, type RulebookForm } from "./form";

type Result = { ok: true } | { ok: false; errors: string[] };

async function gate() {
  const auth = await checkPlatformPermission("settings.manage");
  return auth.ok ? { ok: true as const, actor: { id: auth.user.id, email: auth.user.email } } : { ok: false as const, errors: [auth.error] };
}
const validFy = (fy: string) => /^\d{4}-\d{2}$/.test(fy) && (Number(fy.slice(0, 4)) + 1) % 100 === Number(fy.slice(5, 7));
const BAD_FY: Result = { ok: false, errors: ["That financial year is not valid."] };

export async function saveRulebookAction(fy: string, form: RulebookForm, confirm: boolean): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  if (!validFy(fy)) return BAD_FY;
  const parsed = formToRulebook(fy, form);
  if (!parsed.ok) return parsed;
  const r = await saveRulebook(fy, parsed.rulebook, confirm, g.actor);
  if (r.ok) revalidatePath("/console/tax-rulebook");
  return r.ok ? { ok: true } : r;
}

export async function confirmRulebookAction(fy: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  if (!validFy(fy)) return BAD_FY;
  const r = await confirmRulebook(fy, g.actor);
  if (r.ok) revalidatePath("/console/tax-rulebook");
  return r.ok ? { ok: true } : r;
}

export async function resetRulebookAction(fy: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  if (!validFy(fy)) return BAD_FY;
  await resetRulebook(fy, g.actor);
  revalidatePath("/console/tax-rulebook");
  return { ok: true };
}

export async function rulebookHistoryAction(fy: string): Promise<{ at: string; by: string; action: string }[]> {
  const auth = await checkPlatformPermission("settings.read");
  if (!auth.ok || !validFy(fy)) return [];
  return rulebookHistory(fy);
}
