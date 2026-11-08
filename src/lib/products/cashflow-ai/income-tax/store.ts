import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { getProfitAndLoss } from "@/lib/products/cashflow-ai/reports/profit-and-loss";
import { getAccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";
import { fyRange, isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import { loadRulebook } from "@/lib/products/cashflow-ai/rulebook/rules-store";
import type { TaxRegime } from "@/lib/products/cashflow-ai/rulebook/rules";
import {
  adjustmentProblem,
  computeTax,
  ratesProblem,
  type Adjustment,
  type ComputationResult,
  type LossLine,
  type SetOff,
  type TaxRates,
} from "@/lib/products/cashflow-ai/income-tax/core";

/**
 * The income-tax working of one financial year: the rates, adjustments and loss set-offs the company entered with its CA
 * (`fms_it_years`, one document per year), put together with the profit in the books and the tax already paid or credited.
 */
export const IT_YEARS_COLLECTION = "fms_it_years";
export const IT_PAYMENTS_COLLECTION = "fms_it_payments";
export const IT_LOSSES_COLLECTION = "fms_it_losses";
/** The ledger account the tax provision is expensed to (see provision.ts). */
const TAX_EXPENSE_CODE = "5950";

export interface ItYearDoc extends AuditFields {
  _id: string;
  fy: string;
  /** Rates the company typed (old years, or the advanced override). Not used for a year on a rulebook basis unless `ratesOverride`. */
  rates: TaxRates;
  /** The rulebook basis the company chose; the law's numbers then come from the platform, not from this document. */
  regimeId?: string | null;
  /** True when the company explicitly saved its own rates in the advanced section: they then win over the rulebook. */
  ratesOverride?: boolean;
  adjustments: Adjustment[];
  setOffs: SetOff[];
  note: string | null;
  /** Who agreed the figures with the CA, and when (free text); optional. */
  agreedWithCa: string | null;
}

export const EMPTY_RATES: TaxRates = { regimeLabel: null, baseRate: null, surchargeRate: null, cessRate: null, matRate: null, matApplicable: false, confirmed: false };

let indexed = false;
async function yearsCol() {
  const db = await getDb();
  const col = db.collection<ItYearDoc>(IT_YEARS_COLLECTION);
  if (!indexed) {
    indexed = true;
    await col.createIndex({ fy: 1 }, { unique: true }).catch(() => {});
  }
  return col;
}

export async function getYear(fy: string): Promise<ItYearDoc | null> {
  if (!isFinancialYear(fy)) return null;
  return (await yearsCol()).findOne({ fy, ...notDeleted });
}

type Actor = { id: string; email: string | null };

async function upsertYear(fy: string, patch: Partial<Pick<ItYearDoc, "rates" | "regimeId" | "ratesOverride" | "adjustments" | "setOffs" | "note" | "agreedWithCa">>, actor: Actor, summary: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isFinancialYear(fy)) return { ok: false, error: "Choose a financial year." };
  const col = await yearsCol();
  const res = await col.updateOne({ fy, ...notDeleted }, { $set: { ...patch, ...updateStamp(actor.id) } });
  if (res.matchedCount === 0) {
    const doc: ItYearDoc = { _id: newId(), fy, rates: EMPTY_RATES, adjustments: [], setOffs: [], note: null, agreedWithCa: null, ...patch, ...createStamp(actor.id) } as ItYearDoc;
    try {
      await col.insertOne(doc);
    } catch {
      await col.updateOne({ fy }, { $set: { ...patch, ...updateStamp(actor.id) } });
    }
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "settings", entityId: `it:${fy}`, entityLabel: `Income tax ${fy}`, summary });
  return { ok: true };
}

export async function saveRates(fy: string, rates: TaxRates, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const bad = ratesProblem(rates);
  if (bad) return { ok: false, error: bad };
  if (rates.confirmed && rates.baseRate === null) return { ok: false, error: "Enter the tax rate before marking the rates as confirmed by your CA." };
  if (rates.matApplicable && rates.matRate === null) return { ok: false, error: "MAT is marked as applicable: enter its rate, or untick it." };
  const clean: TaxRates = { ...rates, regimeLabel: rates.regimeLabel?.trim().slice(0, 120) || null };
  return upsertYear(fy, { rates: clean, ratesOverride: true }, actor, `own rates: ${clean.baseRate ?? "—"}%, ${clean.confirmed ? "confirmed by CA" : "not confirmed"}${clean.matApplicable ? `, MAT ${clean.matRate}%` : ""}`);
}

/** The company only chooses which basis it pays under; the rates, surcharge slabs, cess and MAT then come from the platform's rulebook for the year. */
export async function setRegime(fy: string, regimeId: string, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isFinancialYear(fy)) return { ok: false, error: "Choose a financial year." };
  const regime = (await loadRulebook(fy)).regimes.find((r) => r.id === regimeId);
  if (!regime) return { ok: false, error: "That tax basis is not one of the choices for this year." };
  // Choosing a basis ends any custom-rates override, so the choice the person just made is what the tax uses.
  return upsertYear(fy, { regimeId: regime.id, ratesOverride: false }, actor, `tax basis chosen: ${regime.label}`);
}

export async function addAdjustment(fy: string, input: Omit<Adjustment, "id">, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const bad = adjustmentProblem(input);
  if (bad) return { ok: false, error: bad };
  const year = await getYear(fy);
  if ((year?.adjustments.length ?? 0) >= 200) return { ok: false, error: "A year can hold at most 200 adjustments." };
  const a: Adjustment = { id: newId(), kind: input.kind, head: input.head.trim().slice(0, 160), amount: Math.round(input.amount * 100) / 100, scope: input.scope, basis: input.basis?.trim().slice(0, 300) || null };
  // $push keeps two people adding at once from overwriting each other's line
  const col = await yearsCol();
  let res = await col.updateOne({ fy, ...notDeleted }, { $push: { adjustments: a }, $set: updateStamp(actor.id) });
  if (res.matchedCount === 0) {
    // the first write of a year creates its (empty) document; the line is then pushed like any other, so two first writes cannot overwrite each other
    const made = await upsertYear(fy, {}, actor, "year opened");
    if (!made.ok) return made;
    res = await col.updateOne({ fy, ...notDeleted }, { $push: { adjustments: a }, $set: updateStamp(actor.id) });
    if (res.matchedCount === 0) return { ok: false, error: "Could not save the adjustment. Please try again." };
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "settings", entityId: `it:${fy}`, entityLabel: `Income tax ${fy}`, summary: `adjustment ${a.kind === "add" ? "added" : "deducted"}: ${a.head} ${a.amount}` });
  return { ok: true };
}

export async function removeAdjustment(fy: string, id: string, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const col = await yearsCol();
  const res = await col.updateOne({ fy, ...notDeleted, "adjustments.id": id }, { $pull: { adjustments: { id } }, $set: updateStamp(actor.id) });
  if (res.modifiedCount === 0) return { ok: false, error: "That adjustment is not there any more." };
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "delete", entity: "settings", entityId: `it:${fy}`, entityLabel: `Income tax ${fy}`, summary: `adjustment removed (${id})` });
  return { ok: true };
}

export async function saveSetOffs(fy: string, setOffs: SetOff[], actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const s of setOffs) if (!s.lossId || !Number.isFinite(s.amount) || s.amount < 0 || s.amount > 1e11) return { ok: false, error: "Each loss set-off needs an amount of zero or more." };
  const clean = setOffs.filter((s) => s.amount > 0).map((s) => ({ lossId: s.lossId, amount: Math.round(s.amount * 100) / 100 }));
  return upsertYear(fy, { setOffs: clean }, actor, `loss set-off: ${clean.length} loss${clean.length === 1 ? "" : "es"}`);
}

export async function saveNote(fy: string, note: string | null, agreedWithCa: string | null, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  return upsertYear(fy, { note: note?.trim().slice(0, 1000) || null, agreedWithCa: agreedWithCa?.trim().slice(0, 200) || null }, actor, "notes updated");
}

// ───────────────────────────── putting a year together ─────────────────────────────

export interface YearComputation {
  fy: string;
  year: ItYearDoc | null;
  /** The rates the tax was worked with, and where they came from. */
  rates: TaxRates;
  ratesFrom: "rulebook" | "override" | "company" | "none";
  /** The bases the company can choose from, and the one it chose (null = none chosen). */
  regimes: TaxRegime[];
  regime: TaxRegime | null;
  /** The state of the platform rulebook for the year, for the page banner. */
  rulebook: { confirmed: boolean; confirmedBy: string | null; confirmedAt: string | null; source: string; origin: "built-in" | "published" };
  result: ComputationResult;
  losses: LossLine[];
  /** Book profit before tax for the year, and what to remember about how reliable it is. */
  book: { profit: number; hasUnratedForeignCurrency: boolean; accrualSince: string | null; partlyCashBasis: boolean };
  credits: { advanceTax: number; selfAssessment: number; regularAssessment: number; tdsCredit: number };
}

async function readLosses(): Promise<LossLine[]> {
  const db = await getDb();
  const rows = (await db.collection(IT_LOSSES_COLLECTION).find({ ...notDeleted }).sort({ fy: 1 }).toArray()) as unknown as { _id: string; fy: string; kind: LossLine["kind"]; available: number; validUntilFy?: string | null }[];
  return rows.map((r) => ({ id: String(r._id), fy: r.fy, kind: r.kind, available: Number(r.available ?? 0), validUntilFy: r.validUntilFy ?? null }));
}

async function readPayments(fy: string): Promise<{ advance: number; selfAssessment: number; regular: number }> {
  const { taxPaidForYear } = await import("@/lib/products/cashflow-ai/income-tax/payments-store");
  const t = await taxPaidForYear(fy);
  return { advance: t.advance, selfAssessment: t.selfAssessment, regular: t.regular };
}

/** Tax that customers deducted on the company's receipts in the year (the receipts' own record; the 26AS match is on the TDS page). */
async function readTdsCredit(fy: string): Promise<number> {
  const { from, to } = fyRange(fy);
  const db = await getDb();
  const range = { $gte: new Date(`${from}T00:00:00`), $lte: new Date(`${to}T23:59:59.999`) };
  const docs = (await db.collection("fms_receipts").find({ status: "completed", tdsDeducted: { $gt: 0 }, ...notDeleted, $or: [{ clearedAt: range }, { clearedAt: { $in: [null, undefined] }, receiptDate: range }] }).project({ tdsDeducted: 1 }).toArray()) as unknown as { tdsDeducted: number }[];
  return Math.round(docs.reduce((n, d) => n + Number(d.tdsDeducted), 0) * 100) / 100;
}

/**
 * What a year can really set off: a loss that arose in a later year is not available, one past its last usable year is not, and what earlier
 * years' workings already set off is taken away, so the same rupee of loss is never used twice.
 */
async function effectiveLosses(all: LossLine[], fy: string): Promise<LossLine[]> {
  const col = await yearsCol();
  const earlier = await col.find({ fy: { $lt: fy }, ...notDeleted }, { projection: { setOffs: 1 } }).toArray();
  const used = new Map<string, number>();
  for (const y of earlier) for (const s of y.setOffs ?? []) used.set(s.lossId, Math.round(((used.get(s.lossId) ?? 0) + s.amount) * 100) / 100);
  return all.map((l) => {
    const usable = l.fy <= fy && (!l.validUntilFy || l.validUntilFy >= fy);
    const left = usable ? Math.max(0, Math.round((l.available - (used.get(l.id) ?? 0)) * 100) / 100) : 0;
    return { ...l, available: left };
  });
}

export async function loadYearComputation(fy: string): Promise<YearComputation> {
  if (!isFinancialYear(fy)) throw new Error("Financial year must look like 2026-27.");
  const { from, to } = fyRange(fy);
  const [year, rb, allLosses, paid, tdsCredit, pl, accrual] = await Promise.all([
    getYear(fy),
    loadRulebook(fy),
    readLosses(),
    readPayments(fy),
    readTdsCredit(fy),
    getProfitAndLoss({ dateFrom: new Date(`${from}T00:00:00`), dateTo: new Date(`${to}T23:59:59.999`) }),
    getAccrualSettings(),
  ]);
  const regime = (year?.regimeId && rb.regimes.find((r) => r.id === year.regimeId)) || null;
  let rates = EMPTY_RATES;
  let ratesFrom: YearComputation["ratesFrom"] = "none";
  if (year?.ratesOverride) {
    rates = year.rates;
    ratesFrom = "override";
  } else if (regime) {
    rates = { regimeLabel: regime.label, regimeId: regime.id, baseRate: regime.baseRate, surchargeRate: null, surchargeSlabs: regime.surchargeSlabs, cessRate: regime.cessRate, matRate: regime.matRate, matApplicable: regime.matRate !== null, confirmed: rb.confirmed };
    ratesFrom = "rulebook";
  } else if (!year?.regimeId && year && year.rates.baseRate !== null) {
    // Years worked before the rulebook existed hold rates the company typed with its CA; they keep applying exactly as before until a basis is chosen.
    rates = year.rates;
    ratesFrom = "company";
  }
  const losses = await effectiveLosses(allLosses, fy);
  // The profit the tax starts from is the profit BEFORE the income-tax expense itself (a posted provision would otherwise lower its own base).
  const taxExpense = pl.expenses.filter((e) => e.accountCode === TAX_EXPENSE_CODE).reduce((n, e) => n + e.amount, 0);
  const profitBeforeTax = Math.round((pl.netProfit + taxExpense) * 100) / 100;
  const result = computeTax({
    bookProfit: profitBeforeTax,
    adjustments: year?.adjustments ?? [],
    losses,
    setOffs: year?.setOffs ?? [],
    rates,
    credits: { advanceTax: paid.advance, tdsCredit, selfAssessment: paid.selfAssessment + paid.regular },
  });
  return {
    fy,
    year,
    rates,
    ratesFrom,
    regimes: rb.regimes,
    regime,
    rulebook: { confirmed: rb.confirmed, confirmedBy: rb.confirmedBy, confirmedAt: rb.confirmedAt, source: rb.source, origin: rb.origin },
    result,
    losses,
    book: { profit: profitBeforeTax, hasUnratedForeignCurrency: pl.hasUnratedForeignCurrency, accrualSince: accrual?.startDate ?? null, partlyCashBasis: !accrual || accrual.startDate > from },
    credits: { advanceTax: paid.advance, selfAssessment: paid.selfAssessment, regularAssessment: paid.regular, tdsCredit },
  };
}
