import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { BILLS } from "@/lib/products/cashflow-ai/accrual/posting";
import { VENDORS_COLLECTION } from "@/lib/products/spendiq/vendors";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { loadRulebook } from "@/lib/products/cashflow-ai/rulebook/rules-store";
import { deductionRows, financialYearOf, fyRange, isFinancialYear, isQuarter, quarterRange, sectionProblem, type BillForTds, type DeductionRow, type Quarter, type SectionConfig } from "@/lib/products/cashflow-ai/tds/core";

/**
 * The company's TDS sections and the deductions made on vendor bills. The law's numbers come from the platform's tax rulebook for the bill's
 * financial year (see sectionMap); the company enters none. A row in fms_tds_sections now means only one of:
 *  - active:false  — the company does not use this section (hidden on the bill form, not checked);
 *  - override:true — a deliberate advanced override with the company's own numbers (e.g. a lower-deduction certificate); the row's numbers then win;
 *  - a code the rulebook does not have — a section the company defined itself in the old way; its own numbers apply as they always did.
 * A row for a rulebook section WITHOUT override:true (every row saved before the rulebook existed) is read as on/off only and its numbers are
 * ignored, so the law's figures win and nothing silently keeps an old, possibly outdated, number.
 */
export const TDS_SECTIONS_COLLECTION = "fms_tds_sections";

export interface TdsSectionDoc extends AuditFields, SectionConfig {
  _id: string;
  /** Free note: who confirmed it and on what basis (for the CA's file). */
  note: string | null;
  /** true = this row's numbers deliberately replace the rulebook's for this section. Absent/false = on/off only. */
  override?: boolean;
  confirmedAt: Date | null;
  confirmedBy: string | null;
}

let indexed = false;
async function sectionsCol() {
  const db = await getDb();
  const col = db.collection<TdsSectionDoc>(TDS_SECTIONS_COLLECTION);
  if (!indexed) {
    indexed = true;
    await col.createIndex({ code: 1 }, { unique: true }).catch(() => {});
  }
  return col;
}

export async function listSections(): Promise<TdsSectionDoc[]> {
  return (await (await sectionsCol()).find({ ...notDeleted }).sort({ code: 1 }).toArray());
}

/** The sections in force for a financial year (default: the current Indian year), keyed by upper-case code, inactive ones included. */
export async function sectionMap(fy: string = financialYearOf(istToday())): Promise<Map<string, SectionConfig>> {
  const [rb, rows] = await Promise.all([loadRulebook(fy), listSections()]);
  const own = new Map(rows.map((r) => [r.code.toUpperCase(), r]));
  const out = new Map<string, SectionConfig>();
  for (const rule of rb.tds) {
    const code = rule.code.toUpperCase();
    const row = own.get(code);
    const fromLaw: SectionConfig = {
      code: rule.code,
      label: rule.label,
      rate: rule.rate,
      noPanRate: rule.noPanRate,
      singleThreshold: rule.singleThreshold,
      annualThreshold: rule.annualThreshold,
      confirmed: rb.confirmed,
      active: true,
      basis: "rulebook",
    };
    if (!row) out.set(code, fromLaw);
    else if (row.override === true) out.set(code, { code: rule.code, label: row.label, rate: row.rate, noPanRate: row.noPanRate, singleThreshold: row.singleThreshold, annualThreshold: row.annualThreshold, confirmed: row.confirmed, active: row.active, basis: "override" });
    else out.set(code, { ...fromLaw, active: row.active });
  }
  for (const [code, row] of own) if (!out.has(code)) out.set(code, { code: row.code, label: row.label, rate: row.rate, noPanRate: row.noPanRate, singleThreshold: row.singleThreshold, annualThreshold: row.annualThreshold, confirmed: row.confirmed, active: row.active, basis: "own" });
  return out;
}

export type SectionInput = Omit<SectionConfig, "code" | "basis"> & { code: string; note?: string | null; override?: boolean };

type Actor = { id: string; email: string | null };

/** The simple on/off: "we pay under this section" or not. Keeps any numbers and override already on the row. */
export async function setSectionUse(code: string, active: boolean, actor: Actor, fy?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = String(code ?? "").trim().toUpperCase();
  const cfg = (await sectionMap(fy)).get(key);
  if (!cfg) return { ok: false, error: "This section is not on the platform's list for the year." };
  const col = await sectionsCol();
  const existing = await col.findOne({ code: key });
  if (existing) {
    // a removed row is brought back as a plain on/off row, not as an override
    const revive = existing.deletedAt ? { deletedAt: null, override: false } : {};
    await col.updateOne({ _id: existing._id }, { $set: { active, ...revive, ...updateStamp(actor.id) } });
  } else {
    const row = { code: key, label: cfg.label, rate: null, singleThreshold: null, annualThreshold: null, noPanRate: null, confirmed: false, active, override: false, note: null, confirmedAt: null, confirmedBy: null, deletedAt: null };
    try {
      await col.insertOne({ _id: newId(), ...row, ...createStamp(actor.id) });
    } catch {
      await col.updateOne({ code: key }, { $set: { active, ...updateStamp(actor.id) } });
    }
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "settings", entityId: `tds:${key}`, entityLabel: `TDS ${key}`, summary: active ? "company pays under this section" : "company does not use this section" });
  return { ok: true };
}

/** Drops the company's own figures for a section so the platform's apply again. The on/off choice stays. */
export async function clearSectionOverride(code: string, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = String(code ?? "").trim().toUpperCase();
  const res = await (await sectionsCol()).updateOne({ code: key, ...notDeleted }, { $set: { override: false, ...updateStamp(actor.id) } });
  if (res.matchedCount === 0) return { ok: false, error: "Section not found." };
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "settings", entityId: `tds:${key}`, entityLabel: `TDS ${key}`, summary: "own figures dropped; the platform's figures apply" });
  return { ok: true };
}

/** Saves the company's own figures for a section (an advanced override unless input.override is false). */
export async function saveSection(input: SectionInput, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg: SectionInput = {
    ...input,
    code: input.code.trim().toUpperCase(),
    label: input.label.trim().slice(0, 120),
    rate: input.rate ?? null,
    singleThreshold: input.singleThreshold ?? null,
    annualThreshold: input.annualThreshold ?? null,
    noPanRate: input.noPanRate ?? null,
  };
  const bad = sectionProblem(cfg);
  if (bad) return { ok: false, error: bad };
  // "confirmed" with no rate is not a confirmation of anything
  if (cfg.confirmed && cfg.rate === null) return { ok: false, error: "Enter the rate before marking the section as confirmed by your CA." };
  const col = await sectionsCol();
  // a section removed earlier still holds its code (unique): saving it again brings it back
  const existing = await col.findOne({ code: cfg.code });
  const wasRemoved = !!existing?.deletedAt;
  const body = {
    label: cfg.label,
    rate: cfg.rate,
    singleThreshold: cfg.singleThreshold,
    annualThreshold: cfg.annualThreshold,
    noPanRate: cfg.noPanRate,
    confirmed: cfg.confirmed,
    active: cfg.active,
    override: input.override ?? existing?.override ?? true,
    note: input.note?.trim().slice(0, 500) || null,
    confirmedAt: cfg.confirmed ? (existing?.confirmed && !wasRemoved ? existing.confirmedAt : new Date()) : null,
    confirmedBy: cfg.confirmed ? (existing?.confirmed && !wasRemoved ? existing.confirmedBy : actor.id) : null,
    deletedAt: null,
  };
  if (existing) await col.updateOne({ _id: existing._id }, { $set: { ...body, ...updateStamp(actor.id) } });
  else {
    try {
      await col.insertOne({ _id: newId(), code: cfg.code, ...body, ...createStamp(actor.id) });
    } catch {
      await col.updateOne({ code: cfg.code }, { $set: { ...body, ...updateStamp(actor.id) } });
    }
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: existing ? "update" : "create", entity: "settings", entityId: `tds:${cfg.code}`, entityLabel: `TDS ${cfg.code}`, summary: `rate ${cfg.rate ?? "—"}%, ${cfg.confirmed ? "confirmed by CA" : "not confirmed"}, ${cfg.active ? "in use" : "switched off"}` });
  return { ok: true };
}

export async function removeSection(code: string, actor: { id: string; email: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await getDb();
  const used = await db.collection(BILLS).countDocuments({ ...notDeleted, tdsSection: code.toUpperCase() });
  if (used > 0) return { ok: false, error: `${used} bill${used === 1 ? " uses" : "s use"} this section. Switch it off instead of removing it.` };
  const res = await (await sectionsCol()).updateOne({ code: code.toUpperCase(), ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actor.id) } });
  if (res.matchedCount === 0) return { ok: false, error: "Section not found." };
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "delete", entity: "settings", entityId: `tds:${code.toUpperCase()}`, entityLabel: `TDS ${code.toUpperCase()}` });
  return { ok: true };
}

type Raw = Record<string, unknown> & { _id: string };

/** Vendor bills of a financial year as TDS inputs. The whole year is read so the running total to each vendor is right. */
export async function loadBillsForTds(fy: string): Promise<BillForTds[]> {
  if (!isFinancialYear(fy)) throw new Error("Financial year must look like 2026-27.");
  const { from, to } = fyRange(fy);
  const db = await getDb();
  const bills = (await db.collection(BILLS).find({ ...notDeleted, invoiceDate: { $gte: from, $lte: to } }).toArray()) as unknown as Raw[];
  const vendorIds = [...new Set(bills.map((b) => String(b.vendorId)))];
  const vendors = vendorIds.length ? ((await db.collection(VENDORS_COLLECTION).find({ _id: { $in: vendorIds as never[] } }).toArray()) as unknown as Raw[]) : [];
  const pan = new Map(vendors.map((v) => [String(v._id), (v.pan as string | null) ?? null]));
  return bills.map((b) => ({
    billId: String(b._id),
    billNumber: String(b.invoiceNumber),
    vendorId: String(b.vendorId),
    vendorName: String(b.vendorName),
    vendorPan: pan.get(String(b.vendorId)) ?? null,
    date: String(b.invoiceDate),
    base: Number(b.subtotal ?? 0),
    tdsRate: Number(b.tdsRate ?? 0),
    tdsAmount: Number(b.tdsAmount ?? 0),
    section: (b.tdsSection as string | null) ?? null,
    status: String(b.status),
    currency: String(b.currency ?? "INR"),
  }));
}

/** The bills of one financial year are checked against THAT year's rulebook (bills are fetched per year, so one table is enough). */
export async function loadDeductions(fy: string, quarter?: number): Promise<{ all: DeductionRow[]; rows: DeductionRow[]; sections: Map<string, SectionConfig> }> {
  if (!isFinancialYear(fy)) throw new Error("Financial year must look like 2026-27.");
  const sections = await sectionMap(fy);
  const all = deductionRows(await loadBillsForTds(fy), sections);
  const q: Quarter | null = quarter !== undefined && isQuarter(quarter) ? quarter : null;
  const range = q ? quarterRange(fy, q) : null;
  const rows = range ? all.filter((r) => r.bill.date >= range.from && r.bill.date <= range.to) : all;
  return { all, rows, sections };
}
