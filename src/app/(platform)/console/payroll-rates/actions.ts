"use server";

import { revalidatePath } from "next/cache";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { confirmRate, rateHistory, resetRate, saveRate, type RateKind } from "@/lib/products/talentos/payroll/rates-store";

type Result = { ok: true } | { ok: false; errors: string[] };
const KINDS: RateKind[] = ["income_tax", "statutory", "pt", "lwf"];

async function gate() {
  const auth = await checkPlatformPermission("settings.manage");
  return auth.ok ? { ok: true as const, actor: { id: auth.user.id, email: auth.user.email } } : { ok: false as const, errors: [auth.error] };
}
const valid = (kind: string, key: string) => KINDS.includes(kind as RateKind) && /^[A-Za-z0-9 _.\-]{1,60}$/.test(key);

export async function saveRateAction(kind: RateKind, key: string, json: string, confirm: boolean): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  if (!valid(kind, key)) return { ok: false, errors: ["Unknown table."] };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, errors: ["That is not valid JSON."] };
  }
  const r = await saveRate(kind, key, data, confirm, g.actor);
  if (r.ok) revalidatePath("/console/payroll-rates");
  return r.ok ? { ok: true } : r;
}

export async function confirmRateAction(kind: RateKind, key: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  if (!valid(kind, key)) return { ok: false, errors: ["Unknown table."] };
  const r = await confirmRate(kind, key, g.actor);
  if (r.ok) revalidatePath("/console/payroll-rates");
  return r.ok ? { ok: true } : r;
}

export async function resetRateAction(kind: RateKind, key: string): Promise<Result> {
  const g = await gate();
  if (!g.ok) return g;
  if (!valid(kind, key)) return { ok: false, errors: ["Unknown table."] };
  await resetRate(kind, key, g.actor);
  revalidatePath("/console/payroll-rates");
  return { ok: true };
}

export async function rateHistoryAction(kind: RateKind, key: string): Promise<{ at: string; by: string; action: string }[]> {
  const auth = await checkPlatformPermission("settings.read");
  if (!auth.ok || !valid(kind, key)) return [];
  return rateHistory(kind, key);
}
