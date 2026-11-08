import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import { todayIst } from "@/lib/products/cashflow-ai/month-close/core";
import { returnProblem, type ReturnInput } from "@/lib/products/cashflow-ai/income-tax/registers-core";

/** One record per financial year of the income-tax return and tax audit, typed in by the company. No due dates are kept or worked out. */
export const IT_RETURNS_COLLECTION = "fms_it_returns";

type Actor = { id: string; email: string | null };
type Result = { ok: true } | { ok: false; error: string };

export interface ReturnDoc extends AuditFields, ReturnInput {
  _id: string;
  fy: string;
}

let indexed = false;
async function col() {
  const c = (await getDb()).collection<ReturnDoc>(IT_RETURNS_COLLECTION);
  if (!indexed) {
    indexed = true;
    await c.createIndex({ fy: 1 }, { unique: true }).catch(() => {});
  }
  return c;
}

export async function getReturn(fy: string): Promise<ReturnDoc | null> {
  if (!isFinancialYear(fy)) return null;
  return (await col()).findOne({ fy, ...notDeleted });
}

/** Every year with a record, for the all-years status list. */
export async function listReturns(): Promise<ReturnDoc[]> {
  return (await col()).find({ ...notDeleted }).sort({ fy: -1 }).toArray();
}

const blank = (s: string | null | undefined) => s?.trim() || null;

export async function saveReturn(fy: string, raw: ReturnInput, actor: Actor, today: string = todayIst()): Promise<Result> {
  if (!isFinancialYear(fy)) return { ok: false, error: "Choose a financial year like 2026-27." };
  const body: ReturnInput = {
    formLabel: blank(raw.formLabel), filedOn: blank(raw.filedOn), acknowledgementNo: blank(raw.acknowledgementNo), verifiedOn: blank(raw.verifiedOn),
    auditApplicable: raw.auditApplicable, auditReportFiledOn: blank(raw.auditReportFiledOn), auditUdin: blank(raw.auditUdin), auditedBy: blank(raw.auditedBy), note: blank(raw.note),
  };
  const bad = returnProblem(body, today);
  if (bad) return { ok: false, error: bad };
  const c = await col();
  const existing = await c.findOne({ fy });
  const summary = `filed ${body.filedOn ?? "—"}, e-verified ${body.verifiedOn ?? "—"}, audit ${body.auditApplicable}`;
  if (existing) await c.updateOne({ _id: existing._id }, { $set: { ...body, deletedAt: null, ...updateStamp(actor.id) } });
  else {
    try {
      await c.insertOne({ _id: newId(), fy, ...body, ...createStamp(actor.id) });
    } catch {
      // two people saving at once: the unique index keeps one row, the later save updates it
      await c.updateOne({ fy }, { $set: { ...body, ...updateStamp(actor.id) } });
    }
  }
  await recordAudit({ actorId: actor.id, actorEmail: actor.email, action: existing ? "update" : "create", entity: "it_return", entityId: `it-return:${fy}`, entityLabel: `Income-tax return and audit status ${fy}`, summary });
  return { ok: true };
}
