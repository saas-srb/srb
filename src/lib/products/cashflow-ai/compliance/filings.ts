import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { calendarFor } from "@/lib/products/cashflow-ai/rulebook/rules";
import { loadRulebook } from "@/lib/products/cashflow-ai/rulebook/rules-store";
import {
  FILING_CATEGORIES,
  EMPTY_PROFILE,
  appliesToProfile,
  isDateString,
  isFilingYear,
  type ComplianceProfile,
  type FilingCategory,
  type FilingStatus,
} from "@/lib/products/cashflow-ai/compliance/filings-core";

/**
 * The company's filing calendar: one row per return / form / payment with a
 * due date. "Fill in my filing calendar" copies the year's dates from the
 * platform's tax rulebook (generated rows); a row added by hand may still sit
 * without a date and then shows as such.
 */
export const COMPLIANCE_FILINGS_COLLECTION = "fms_compliance_filings";

export interface ComplianceFiling extends AuditFields {
  _id: string;
  name: string;
  /** Form number / short code, e.g. "GSTR-3B". */
  form: string | null;
  category: FilingCategory;
  /** What period it covers, e.g. "Sep 2026" or "FY 2025-26". */
  period: string | null;
  /** YYYY-MM-DD, or null while the CA has not confirmed it. */
  dueDate: string | null;
  dueDateConfirmed: boolean;
  status: FilingStatus;
  owner: string | null;
  filedOn: string | null;
  /** Acknowledgement / ARN / challan number from the portal. */
  ackNumber: string | null;
  note: string | null;
  /** Set on rows copied from the tax rulebook: which rule and which period they are, so a second fill never repeats them. */
  ruleId?: string;
  generated?: boolean;
  /** Every earlier due date of a generated row that the platform later moved (an extension). */
  dateHistory?: { from: string; to: string; at: Date; by: string }[];
  /** YYYY-MM-DD the platform checked this date (the rulebook's confirmation day); null while unchecked. */
  dateCheckedOn?: string | null;
  /** The company typed the date itself, so a platform update does not overwrite it. */
  dateEditedByHand?: boolean;
}

export const COMPLIANCE_PROFILE_COLLECTION = "fms_compliance_profile";

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<ComplianceFiling>(COMPLIANCE_FILINGS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([collection.createIndex({ dueDate: 1 }).catch(() => {}), collection.createIndex({ status: 1 }).catch(() => {}),
      // one generated row per rule and period, even if two people tap "Fill in" together
      collection.createIndex({ ruleId: 1, period: 1 }, { unique: true, partialFilterExpression: { generated: true } }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function listFilings(): Promise<ComplianceFiling[]> {
  const rows = await (await getCollection()).find({ ...notDeleted }).toArray();
  // dated first (soonest), undated after
  return rows.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}

export interface FilingInput {
  name: string;
  form?: string | null;
  category: string;
  period?: string | null;
  dueDate?: string | null;
  dueDateConfirmed?: boolean;
  owner?: string | null;
  note?: string | null;
}

const CATEGORY_VALUES = new Set<string>(FILING_CATEGORIES.map((c) => c.value));
const clean = (v: string | null | undefined, max: number) => v?.trim().slice(0, max) || null;

export async function createFiling(input: FilingInput, actorId: string, actorEmail: string | null): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = clean(input.name, 160);
  if (!name) return { ok: false, error: "Give the filing a name." };
  if (!CATEGORY_VALUES.has(input.category)) return { ok: false, error: "Pick a category." };
  const dueDate = clean(input.dueDate, 10);
  if (dueDate && !isDateString(dueDate)) return { ok: false, error: "Due date is not a valid date." };
  const doc: ComplianceFiling = {
    _id: newId(),
    name,
    form: clean(input.form, 40),
    category: input.category as FilingCategory,
    period: clean(input.period, 60),
    dueDate,
    dueDateConfirmed: !!dueDate && !!input.dueDateConfirmed,
    status: "pending",
    owner: clean(input.owner, 120),
    filedOn: null,
    ackNumber: null,
    note: clean(input.note, 1000),
    ...createStamp(actorId),
  };
  await (await getCollection()).insertOne(doc);
  await recordAudit({ actorId, actorEmail, action: "create", entity: "compliance_filing", entityId: doc._id, entityLabel: name, summary: dueDate ? `due ${dueDate}` : "no date yet" });
  return { ok: true, id: doc._id };
}

export async function getComplianceProfile(): Promise<ComplianceProfile> {
  const db = await getDb();
  const doc = await db.collection<{ _id: string } & Partial<ComplianceProfile>>(COMPLIANCE_PROFILE_COLLECTION).findOne({ _id: "main" });
  const yn = (v: unknown) => (typeof v === "boolean" ? v : null);
  return doc ? { gstRegistered: yn(doc.gstRegistered), hasEmployees: yn(doc.hasEmployees), deductsTds: yn(doc.deductsTds), isPrivateLimited: yn(doc.isPrivateLimited) } : { ...EMPTY_PROFILE };
}

/** Saves the answers given; a key left out keeps its earlier answer. */
export async function saveComplianceProfile(patch: Partial<ComplianceProfile>, actorId: string, actorEmail: string | null): Promise<ComplianceProfile> {
  const set: Record<string, boolean | null> = {};
  for (const k of Object.keys(EMPTY_PROFILE) as (keyof ComplianceProfile)[]) {
    const v = patch[k];
    if (typeof v === "boolean" || v === null) set[k] = v;
  }
  const db = await getDb();
  await db.collection<{ _id: string }>(COMPLIANCE_PROFILE_COLLECTION).updateOne({ _id: "main" }, { $set: { ...set, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true });
  await recordAudit({ actorId, actorEmail, action: "update", entity: "compliance_item", entityId: "main", entityLabel: "Which filings apply", summary: Object.entries(set).map(([k, v]) => `${k}: ${v === null ? "not answered" : v ? "yes" : "no"}`).join(", ") });
  return getComplianceProfile();
}

type Actor = { id: string; email: string | null };

/**
 * Copies the year's due dates from the tax rulebook onto the calendar, for the filing types that apply to the company. Safe to run again:
 * a rule + period that is already on the calendar (even removed or filed) is never added twice and never changed here.
 */
export async function generateYearFilings(fy: string, profile: ComplianceProfile, actor: Actor): Promise<{ ok: true; added: number; alreadyThere: number; confirmed: boolean } | { ok: false; error: string }> {
  if (!isFilingYear(fy)) return { ok: false, error: "Write the financial year like 2026-27." };
  const rulebook = await loadRulebook(fy);
  const items = calendarFor(rulebook).filter((i) => appliesToProfile(i, profile));
  const collection = await getCollection();
  const checkedOn = rulebook.confirmed ? rulebook.confirmedAt?.slice(0, 10) ?? null : null;
  let added = 0;
  for (const i of items) {
    const res = await collection.updateOne(
      { ruleId: i.ruleId, period: i.period, generated: true },
      {
        $setOnInsert: {
          _id: newId(),
          name: i.name,
          form: i.form,
          category: i.category,
          dueDate: i.dueDate,
          dueDateConfirmed: rulebook.confirmed,
          dateCheckedOn: checkedOn,
          status: "pending",
          owner: null,
          filedOn: null,
          ackNumber: null,
          note: null,
          ...createStamp(actor.id),
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount === 1) added++;
  }
  if (added) await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "create", entity: "compliance_filing", entityId: `year-${fy}`, entityLabel: `Filing calendar FY ${fy}`, summary: `${added} added from the tax rulebook` });
  return { ok: true, added, alreadyThere: items.length - added, confirmed: rulebook.confirmed };
}

/**
 * Brings generated rows that are not yet filed in line with the rulebook as it stands now: a moved date (an extension) replaces the old one, and
 * the old one is kept in `dateHistory`. Filed rows, rows marked not applicable and dates the company typed itself are left alone.
 */
export async function refreshYearDates(fy: string, actor: Actor): Promise<{ ok: true; moved: number; skippedByHand: number } | { ok: false; error: string }> {
  if (!isFilingYear(fy)) return { ok: false, error: "Write the financial year like 2026-27." };
  const rulebook = await loadRulebook(fy);
  const collection = await getCollection();
  const checkedOn = rulebook.confirmed ? rulebook.confirmedAt?.slice(0, 10) ?? null : null;
  let moved = 0;
  let skippedByHand = 0;
  for (const i of calendarFor(rulebook)) {
    const row = await collection.findOne({ ruleId: i.ruleId, period: i.period, generated: true, status: "pending", ...notDeleted });
    if (!row) continue;
    if (row.dueDate === i.dueDate) {
      // the date is the same, but the platform may have checked it since
      if (row.dueDateConfirmed !== rulebook.confirmed && !row.dateEditedByHand) await collection.updateOne({ _id: row._id }, { $set: { dueDateConfirmed: rulebook.confirmed, dateCheckedOn: checkedOn, ...updateStamp(actor.id) } });
      continue;
    }
    if (row.dateEditedByHand) {
      skippedByHand++;
      continue;
    }
    const history = row.dueDate ? { $push: { dateHistory: { from: row.dueDate, to: i.dueDate, at: new Date(), by: actor.email ?? actor.id } } } : {};
    await collection.updateOne({ _id: row._id, status: "pending" }, { $set: { dueDate: i.dueDate, dueDateConfirmed: rulebook.confirmed, dateCheckedOn: checkedOn, ...updateStamp(actor.id) }, ...history } as never);
    await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: "update", entity: "compliance_filing", entityId: row._id, entityLabel: row.name, summary: `due date moved ${row.dueDate ?? "none"} → ${i.dueDate}` });
    moved++;
  }
  return { ok: true, moved, skippedByHand };
}

export async function updateFiling(
  id: string,
  patch: { dueDate?: string | null; dueDateConfirmed?: boolean; owner?: string | null; note?: string | null; period?: string | null },
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const collection = await getCollection();
  const filing = await collection.findOne({ _id: id, ...notDeleted });
  if (!filing) return { ok: false, error: "Filing not found." };
  const set: Record<string, unknown> = { ...updateStamp(actorId) };
  if (patch.dueDate !== undefined) {
    const d = clean(patch.dueDate, 10);
    if (d && !isDateString(d)) return { ok: false, error: "Due date is not a valid date." };
    set.dueDate = d;
    if (filing.generated) set.dateEditedByHand = true;
    if (!d) set.dueDateConfirmed = false;
  }
  if (patch.dueDateConfirmed !== undefined) {
    const finalDate = set.dueDate !== undefined ? (set.dueDate as string | null) : filing.dueDate;
    set.dueDateConfirmed = !!finalDate && patch.dueDateConfirmed;
  }
  if (patch.owner !== undefined) set.owner = clean(patch.owner, 120);
  if (patch.note !== undefined) set.note = clean(patch.note, 1000);
  if (patch.period !== undefined) set.period = clean(patch.period, 60);
  await collection.updateOne({ _id: id }, { $set: set });
  await recordAudit({ actorId, actorEmail, action: "update", entity: "compliance_filing", entityId: id, entityLabel: filing.name, summary: Object.keys(set).filter((k) => !["updatedAt", "updatedBy"].includes(k)).join(", ") });
  return { ok: true };
}

export async function markFiled(
  id: string,
  input: { filedOn: string; ackNumber?: string | null },
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isDateString(input.filedOn)) return { ok: false, error: "Enter the date it was filed." };
  if (new Date(`${input.filedOn}T00:00:00Z`).getTime() > Date.now() + 36 * 3600_000) return { ok: false, error: "Filed date cannot be in the future." };
  const collection = await getCollection();
  const filing = await collection.findOne({ _id: id, ...notDeleted });
  if (!filing) return { ok: false, error: "Filing not found." };
  await collection.updateOne({ _id: id }, { $set: { status: "filed", filedOn: input.filedOn, ackNumber: clean(input.ackNumber, 80), ...updateStamp(actorId) } });
  await recordAudit({ actorId, actorEmail, action: "status_change", entity: "compliance_filing", entityId: id, entityLabel: filing.name, summary: `filed on ${input.filedOn}${input.ackNumber ? ` (ack ${input.ackNumber})` : ""}` });
  return { ok: true };
}

export async function setFilingStatus(
  id: string,
  status: "pending" | "not_applicable",
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const collection = await getCollection();
  const filing = await collection.findOne({ _id: id, ...notDeleted });
  if (!filing) return { ok: false, error: "Filing not found." };
  await collection.updateOne({ _id: id }, { $set: { status, filedOn: null, ackNumber: null, ...updateStamp(actorId) } });
  await recordAudit({ actorId, actorEmail, action: "status_change", entity: "compliance_filing", entityId: id, entityLabel: filing.name, summary: `${filing.status} → ${status}` });
  return { ok: true };
}

export async function deleteFiling(id: string, actorId: string, actorEmail: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const collection = await getCollection();
  const filing = await collection.findOne({ _id: id, ...notDeleted });
  if (!filing) return { ok: false, error: "Filing not found." };
  await collection.updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  await recordAudit({ actorId, actorEmail, action: "delete", entity: "compliance_filing", entityId: id, entityLabel: filing.name });
  return { ok: true };
}

