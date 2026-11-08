import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import {
  BUILTIN_INCOME_TAX, BUILTIN_LWF, BUILTIN_PT, BUILTIN_STATUTORY, incomeTaxFor, ptRuleFor, type IncomeTaxYear, type LwfRule, type PtRule, type StatutoryRates,
} from "@/lib/products/talentos/payroll/rates";
import { validateIncomeTaxYear, validateLwfRule, validatePtRule, validateStatutory } from "@/lib/products/talentos/payroll/rates-validate";

/**
 * The law's payroll figures as the platform publishes them (`payroll_statutory_rates`, one document per table). Every company reads the same
 * figures, so when the law changes a platform administrator updates one table and every company's next payroll uses it, with no deployment.
 *
 * A table without a document uses the built-in one from `rates.ts`. Saving a table stores a new version and marks it unconfirmed;
 * a platform administrator then checks it against the notification and confirms it. Payroll uses an unconfirmed table, but every payslip
 * that does says so, so nobody pays on unchecked figures without knowing.
 */

export type RateKind = "income_tax" | "statutory" | "pt" | "lwf";
const COLLECTION = "payroll_statutory_rates";

interface RateDoc {
  _id: string;
  kind: RateKind;
  key: string;
  data: unknown;
  confirmed: boolean;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  version: number;
  updatedAt: Date;
  updatedBy: string;
  history: { version: number; at: Date; by: string; action: "save" | "confirm" | "reset"; data?: unknown }[];
}

export interface RatesBundle {
  incomeTax: IncomeTaxYear[];
  statutory: StatutoryRates;
  pt: PtRule[];
  lwf: LwfRule[];
}

const g = globalThis as unknown as { __payrollRates?: { at: number; value: RatesBundle } };
const col = async () => (await getPlatformDb()).collection<RateDoc>(COLLECTION);
const docId = (kind: RateKind, key: string) => `${kind}:${key}`;
export const forgetPayrollRates = () => {
  g.__payrollRates = undefined;
};

function merge(docs: RateDoc[]): RatesBundle {
  const byId = new Map(docs.map((d) => [d._id, d]));
  const incomeTax: IncomeTaxYear[] = BUILTIN_INCOME_TAX.map((b) => {
    const d = byId.get(docId("income_tax", b.fy));
    return d ? { ...(d.data as IncomeTaxYear), fy: b.fy, confirmed: d.confirmed } : b;
  });
  for (const d of docs) if (d.kind === "income_tax" && !incomeTax.some((y) => y.fy === d.key)) incomeTax.push({ ...(d.data as IncomeTaxYear), fy: d.key, confirmed: d.confirmed });
  incomeTax.sort((a, b) => (a.fy < b.fy ? -1 : 1));

  const section = <K extends keyof StatutoryRates>(k: K): StatutoryRates[K] => {
    const d = byId.get(docId("statutory", k));
    return d ? ({ ...(d.data as StatutoryRates[K]), confirmed: d.confirmed } as StatutoryRates[K]) : BUILTIN_STATUTORY[k];
  };
  const statutory: StatutoryRates = { providentFund: section("providentFund"), esi: section("esi"), gratuity: section("gratuity"), bonus: section("bonus"), leaveEncashment: section("leaveEncashment") };

  const pt: PtRule[] = BUILTIN_PT.map((b) => {
    const d = byId.get(docId("pt", b.state));
    return d ? { ...(d.data as PtRule), state: b.state, confirmed: d.confirmed } : b;
  });
  for (const d of docs) if (d.kind === "pt" && !pt.some((r) => r.state === d.key)) pt.push({ ...(d.data as PtRule), state: d.key, confirmed: d.confirmed });

  const lwf: LwfRule[] = BUILTIN_LWF.map((b) => {
    const d = byId.get(docId("lwf", b.state));
    return d ? { ...(d.data as LwfRule), state: b.state, confirmed: d.confirmed } : b;
  });
  for (const d of docs) if (d.kind === "lwf" && !lwf.some((r) => r.state === d.key)) lwf.push({ ...(d.data as LwfRule), state: d.key, confirmed: d.confirmed });
  return { incomeTax, statutory, pt, lwf };
}

/** Every table in force. A database problem falls back to the built-in tables rather than stopping payroll. */
export async function loadRates(): Promise<RatesBundle> {
  if (g.__payrollRates && Date.now() - g.__payrollRates.at < 60_000) return g.__payrollRates.value;
  let value: RatesBundle;
  try {
    value = merge(await (await col()).find({}).toArray());
  } catch (err) {
    console.error("[payroll-rates] could not read the published tables; using the built-in ones", err instanceof Error ? err.message : err);
    value = { incomeTax: BUILTIN_INCOME_TAX, statutory: BUILTIN_STATUTORY, pt: BUILTIN_PT, lwf: BUILTIN_LWF };
  }
  g.__payrollRates = { at: Date.now(), value };
  return value;
}

/** The figures for one month and one work state, as the payroll engine takes them. */
export async function ratesFor(month: string, state: string | null) {
  const b = await loadRates();
  const fy = `${Number(month.slice(5, 7)) >= 4 ? month.slice(0, 4) : Number(month.slice(0, 4)) - 1}`;
  const fyKey = `${fy}-${String((Number(fy) + 1) % 100).padStart(2, "0")}`;
  return {
    statutory: b.statutory,
    incomeTax: incomeTaxFor(fyKey, b.incomeTax),
    pt: ptRuleFor(state, b.pt),
    lwf: state ? (b.lwf.find((r) => r.state.toLowerCase() === state.toLowerCase()) ?? null) : null,
  };
}

// ── Console ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface RateEntry {
  kind: RateKind;
  key: string;
  label: string;
  source: "built-in" | "published";
  confirmed: boolean;
  confirmedBy: string | null;
  confirmedAt: string | null;
  version: number;
  note: string;
  data: unknown;
}

export async function listRateEntries(): Promise<RateEntry[]> {
  const docs = new Map((await (await col()).find({}).toArray()).map((d) => [d._id, d]));
  const bundle = merge([...docs.values()]);
  const entry = (kind: RateKind, key: string, label: string, data: unknown, confirmed: boolean, note: string): RateEntry => {
    const d = docs.get(docId(kind, key));
    return { kind, key, label, source: d ? "published" : "built-in", confirmed, confirmedBy: d?.confirmedBy ?? null, confirmedAt: d?.confirmedAt?.toISOString() ?? null, version: d?.version ?? 0, note, data };
  };
  const out: RateEntry[] = [];
  for (const y of bundle.incomeTax) out.push(entry("income_tax", y.fy, `Income tax, FY ${y.fy}`, y, y.confirmed, y.source));
  out.push(entry("statutory", "providentFund", "Provident fund (EPF, EPS, EDLI, admin)", bundle.statutory.providentFund, bundle.statutory.providentFund.confirmed, bundle.statutory.providentFund.source));
  out.push(entry("statutory", "esi", "Employees' State Insurance", bundle.statutory.esi, bundle.statutory.esi.confirmed, bundle.statutory.esi.source));
  out.push(entry("statutory", "gratuity", "Gratuity", bundle.statutory.gratuity, bundle.statutory.gratuity.confirmed, bundle.statutory.gratuity.source));
  out.push(entry("statutory", "bonus", "Statutory bonus", bundle.statutory.bonus, bundle.statutory.bonus.confirmed, bundle.statutory.bonus.source));
  out.push(entry("statutory", "leaveEncashment", "Leave encashment exemption", bundle.statutory.leaveEncashment, bundle.statutory.leaveEncashment.confirmed, bundle.statutory.leaveEncashment.source));
  for (const r of bundle.pt) out.push(entry("pt", r.state, `Professional tax, ${r.state}`, r, r.confirmed, r.source));
  for (const r of bundle.lwf) out.push(entry("lwf", r.state, `Labour welfare fund, ${r.state}`, r, r.confirmed, r.source));
  return out;
}

function validate(kind: RateKind, key: string, data: unknown): string[] {
  if (kind === "income_tax") return validateIncomeTaxYear({ ...(data as IncomeTaxYear), fy: key });
  if (kind === "pt") return validatePtRule({ ...(data as PtRule), state: key });
  if (kind === "lwf") return validateLwfRule({ ...(data as LwfRule), state: key });
  const current = merge([]).statutory;
  return validateStatutory({ ...current, [key]: data } as StatutoryRates);
}

type Actor = { id: string; email: string };
export type RateResult = { ok: true; version: number } | { ok: false; errors: string[] };

/** Publishes a table. `confirm` also marks it checked (the administrator saved figures they have verified). */
export async function saveRate(kind: RateKind, key: string, data: unknown, confirm: boolean, actor: Actor): Promise<RateResult> {
  if (!data || typeof data !== "object") return { ok: false, errors: ["The table is empty."] };
  const errors = validate(kind, key, data);
  if (errors.length) return { ok: false, errors };
  const c = await col();
  const id = docId(kind, key);
  const row = await c.findOneAndUpdate(
    { _id: id },
    {
      $inc: { version: 1 },
      $set: { kind, key, data, confirmed: confirm, confirmedAt: confirm ? new Date() : null, confirmedBy: confirm ? actor.email : null, updatedAt: new Date(), updatedBy: actor.email },
      $push: { history: { version: 0, at: new Date(), by: actor.email, action: confirm ? "confirm" : "save", data } as never },
    },
    { upsert: true, returnDocument: "after" },
  );
  forgetPayrollRates();
  await recordPlatformAudit({ actorId: actor.id, action: confirm ? "payroll.rates.confirm" : "payroll.rates.save", target: { type: "payroll_rates", id }, details: { version: row?.version ?? 1 } });
  return { ok: true, version: row?.version ?? 1 };
}

/** Marks the table in force (published or built-in) as checked against the notification. */
export async function confirmRate(kind: RateKind, key: string, actor: Actor): Promise<RateResult> {
  const entry = (await listRateEntries()).find((e) => e.kind === kind && e.key === key);
  if (!entry) return { ok: false, errors: ["That table does not exist."] };
  return saveRate(kind, key, entry.data, true, actor);
}

/** Back to the built-in table. */
export async function resetRate(kind: RateKind, key: string, actor: Actor): Promise<RateResult> {
  const id = docId(kind, key);
  await (await col()).deleteOne({ _id: id });
  forgetPayrollRates();
  await recordPlatformAudit({ actorId: actor.id, action: "payroll.rates.reset", target: { type: "payroll_rates", id }, details: {} });
  return { ok: true, version: 0 };
}

export async function rateHistory(kind: RateKind, key: string): Promise<{ at: string; by: string; action: string }[]> {
  const d = await (await col()).findOne({ _id: docId(kind, key) });
  return (d?.history ?? []).slice(-30).reverse().map((h) => ({ at: h.at.toISOString(), by: h.by, action: h.action }));
}
