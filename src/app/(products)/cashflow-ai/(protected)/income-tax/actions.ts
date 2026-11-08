"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageCompliance, canManageFiscalPeriods } from "@/lib/fms-roles";
import { postProvision, removeProvision } from "@/lib/products/cashflow-ai/income-tax/provision";
import { addAdjustment, removeAdjustment, saveNote, saveRates, saveSetOffs, setRegime } from "@/lib/products/cashflow-ai/income-tax/store";
import type { TaxRates } from "@/lib/products/cashflow-ai/income-tax/core";

type Result = { ok: true } | { ok: false; error: string };

async function manager() {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageCompliance(user)) throw new Error("Forbidden");
  return { id: user.id, email: user.email };
}
const refresh = () => revalidatePath("/cashflow-ai/income-tax", "layout");

/** An amount typed as plain digits with an optional decimal part and commas: no exponents, no hex, no signs. NaN when it is not. */
function amountOf(v: unknown): number {
  const s = String(v ?? "").trim().replace(/,/g, "");
  return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : Number.NaN;
}

/** "" or missing = not entered (null); anything else must be a plain non-negative number. */
function pct(v: unknown): number | null | "bad" {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/,/g, "");
  if (s === "") return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return "bad";
  return Number(s);
}

export async function saveRatesAction(fy: string, input: { regimeLabel: string; baseRate: string; surchargeRate: string; cessRate: string; matRate: string; matApplicable: boolean; confirmed: boolean }): Promise<Result> {
  const actor = await manager();
  const base = pct(input.baseRate), sur = pct(input.surchargeRate), cess = pct(input.cessRate), mat = pct(input.matRate);
  if ([base, sur, cess, mat].includes("bad")) return { ok: false, error: "Enter rates as plain numbers, for example 25 or 17.5." };
  const rates: TaxRates = { regimeLabel: input.regimeLabel, baseRate: base as number | null, surchargeRate: sur as number | null, cessRate: cess as number | null, matRate: mat as number | null, matApplicable: !!input.matApplicable, confirmed: !!input.confirmed };
  const r = await saveRates(fy, rates, actor);
  if (r.ok) refresh();
  return r;
}

export async function setRegimeAction(fy: string, regimeId: string): Promise<Result> {
  const actor = await manager();
  const r = await setRegime(fy, String(regimeId ?? "").slice(0, 60), actor);
  if (r.ok) refresh();
  return r;
}

export async function addAdjustmentAction(fy: string, input: { kind: string; head: string; amount: string; scope: string; basis: string }): Promise<Result> {
  const actor = await manager();
  const amount = amountOf(input.amount);
  const r = await addAdjustment(fy, { kind: input.kind as "add" | "less", head: input.head, amount, scope: input.scope as "normal" | "mat" | "both", basis: input.basis }, actor);
  if (r.ok) refresh();
  return r;
}

export async function removeAdjustmentAction(fy: string, id: string): Promise<Result> {
  const actor = await manager();
  const r = await removeAdjustment(fy, id, actor);
  if (r.ok) refresh();
  return r;
}

export async function saveSetOffsAction(fy: string, entries: { lossId: string; amount: string }[]): Promise<Result> {
  const actor = await manager();
  const parsed = entries.map((e) => ({ lossId: e.lossId, amount: e.amount.trim() === "" ? 0 : amountOf(e.amount) }));
  const r = await saveSetOffs(fy, parsed, actor);
  if (r.ok) refresh();
  return r;
}

export async function saveNoteAction(fy: string, note: string, agreedWithCa: string): Promise<Result> {
  const actor = await manager();
  const r = await saveNote(fy, note, agreedWithCa, actor);
  if (r.ok) refresh();
  return r;
}

async function ledgerAdmin() {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageFiscalPeriods(user)) throw new Error("Forbidden");
  return { id: user.id, email: user.email };
}

export async function postProvisionAction(fy: string): Promise<Result> {
  const actor = await ledgerAdmin();
  const r = await postProvision(fy, actor);
  if (!r.ok) return r;
  for (const path of ["/cashflow-ai/trial-balance", "/cashflow-ai/reports/profit-and-loss", "/cashflow-ai/reports/balance-sheet"]) revalidatePath(path);
  refresh();
  return { ok: true };
}

export async function removeProvisionAction(fy: string): Promise<Result> {
  const actor = await ledgerAdmin();
  const r = await removeProvision(fy, actor);
  if (r.ok) {
    for (const path of ["/cashflow-ai/trial-balance", "/cashflow-ai/reports/profit-and-loss", "/cashflow-ai/reports/balance-sheet"]) revalidatePath(path);
    refresh();
  }
  return r;
}
