import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { dayOf } from "@/lib/products/cashflow-ai/accrual/core";
import { fyRange, isFinancialYear } from "@/lib/products/cashflow-ai/tds/core";
import {
  MAX_FILE_BYTES,
  parseTdsCredits,
  reconcileCredits,
  type BookCredit,
  type ParsedCredit,
  type Reconciliation,
  type RejectedReason,
  MAX_COMPARISONS,
} from "@/lib/products/cashflow-ai/tds/credits-core";

/**
 * The Form 26AS credits the company loaded, per financial year. One upload per year is "active"; a new file for the same year replaces it
 * and the old upload's details stay on record as "superseded" (its rows are dropped, the audit trail is not). The comparison is NOT
 * stored: it is worked out again on every read from the stored rows and the receipts as they stand today.
 */
export const TDS26AS_UPLOADS = "fms_tds26as_uploads";
export const TDS26AS_ROWS = "fms_tds26as_rows";
const RECEIPTS = "fms_receipts";

export interface Tds26asUpload extends AuditFields {
  _id: string;
  fy: string;
  fileName: string;
  sha256: string;
  rowCount: number;
  rejectedCount: number;
  rejected: RejectedReason[];
  uploadedBy: string;
  status: "active" | "superseded";
  supersededAt: Date | null;
  supersededBy: string | null;
}

type RowDoc = AuditFields & ParsedCredit & { _id: string; uploadId: string; fy: string };

let indexesEnsured = false;
async function cols() {
  const db = await getDb();
  const uploads = db.collection<Tds26asUpload>(TDS26AS_UPLOADS);
  const rows = db.collection<RowDoc>(TDS26AS_ROWS);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      uploads.createIndex({ fy: 1, status: 1, createdAt: -1 }).catch(() => {}),
      rows.createIndex({ uploadId: 1 }).catch(() => {}),
    ]);
  }
  return { uploads, rows };
}

export type SaveResult = { ok: true; uploadId: string; replaced: boolean; rows: number; rejectedCount: number } | { ok: false; error: string };

export async function saveTdsCreditsUpload(
  input: { fy: string; fileName: string; text: string },
  actor: { id: string; email: string | null }
): Promise<SaveResult> {
  if (!isFinancialYear(input.fy)) return { ok: false, error: "Choose a financial year." };
  if (typeof input.text !== "string" || Buffer.byteLength(input.text, "utf8") > MAX_FILE_BYTES) return { ok: false, error: "The file is larger than 5 MB." };
  const parsed = parseTdsCredits(input.text, { fy: input.fy });
  if (!parsed.ok) return parsed;

  // a comparison this large would tie the server up on every page view: refuse it here, where the person can still fix the file
  const bookCount = (await loadBooksTds(input.fy)).length;
  if (bookCount * parsed.rows.length > MAX_COMPARISONS) return { ok: false, error: "This file has too many rows to compare with this year's receipts. Upload a smaller file." };

  const sha256 = createHash("sha256").update(input.text).digest("hex");
  const { uploads, rows } = await cols();
  const active = await uploads.find({ fy: input.fy, status: "active", ...notDeleted }).toArray();
  if (active.some((u) => u.sha256 === sha256)) return { ok: false, error: "This exact file is already loaded for this year." };

  const id = newId();
  const stamp = createStamp(actor.id);
  const docs: RowDoc[] = parsed.rows.map((r) => ({ _id: newId(), uploadId: id, fy: input.fy, ...r, ...stamp }));
  const fileName = (input.fileName || "upload").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 200);
  // rows first, then the upload record: until the record exists nobody reads these rows. If anything fails, the rows are removed again.
  try {
    for (let i = 0; i < docs.length; i += 1000) await rows.insertMany(docs.slice(i, i + 1000) as never);
    await uploads.insertOne({
      _id: id, fy: input.fy, fileName, sha256, rowCount: parsed.rows.length, rejectedCount: parsed.rejectedCount, rejected: parsed.rejected,
      uploadedBy: actor.id, status: "active", supersededAt: null, supersededBy: null, ...stamp,
    });
  } catch (e) {
    await rows.deleteMany({ uploadId: id }).catch(() => {});
    throw e;
  }
  // retire only EARLIER active uploads, so two uploads racing cannot retire each other
  const retire = await uploads.find({ fy: input.fy, status: "active", _id: { $ne: id }, createdAt: { $lt: stamp.createdAt }, ...notDeleted }).toArray();
  const retireIds = retire.map((u) => u._id);
  if (retireIds.length) {
    await uploads.updateMany({ _id: { $in: retireIds } }, { $set: { status: "superseded", supersededAt: new Date(), supersededBy: id, ...updateStamp(actor.id) } });
    await rows.deleteMany({ uploadId: { $in: retireIds } });
  }
  await recordAudit({
    actorId: actor.id, actorEmail: actor.email, action: "import", entity: "tds26as_upload", entityId: id, entityLabel: `Form 26AS credits ${input.fy}`,
    summary: `Form 26AS credits for ${input.fy} loaded from ${fileName}: ${parsed.rows.length} rows, ${parsed.rejectedCount} rows not read${retireIds.length ? " (replaces the earlier upload)" : ""}`,
    metadata: { sha256, kind: "tds26as_upload" },
  });
  return { ok: true, uploadId: id, replaced: retireIds.length > 0, rows: parsed.rows.length, rejectedCount: parsed.rejectedCount };
}

export async function getActiveUpload(fy: string): Promise<Tds26asUpload | null> {
  if (!isFinancialYear(fy)) return null;
  const { uploads } = await cols();
  const list = await uploads.find({ fy, status: "active", ...notDeleted }).sort({ createdAt: -1 }).limit(1).toArray();
  return list[0] ?? null;
}

export async function listSupersededUploads(fy: string): Promise<Tds26asUpload[]> {
  if (!isFinancialYear(fy)) return [];
  const { uploads } = await cols();
  return uploads.find({ fy, status: "superseded", ...notDeleted }).sort({ createdAt: -1 }).limit(20).toArray();
}

/** Receipts of the year that carry TDS deducted by the customer, as the books stand now. Voided, bounced and not-yet-cleared receipts are left out. */
export async function loadBooksTds(fy: string): Promise<BookCredit[]> {
  if (!isFinancialYear(fy)) return [];
  const { from, to } = fyRange(fy);
  const db = await getDb();
  // receipt dates are stored at the server's local midnight of their day (see dayOf). A cheque counts on the day it cleared (that is when the
  // tax credit is booked), any other receipt on its own date.
  const range = { $gte: new Date(`${from}T00:00:00`), $lte: new Date(`${to}T23:59:59.999`) };
  const docs = await db
    .collection(RECEIPTS)
    .find({ status: "completed", tdsDeducted: { $gt: 0 }, ...notDeleted, $or: [{ clearedAt: range }, { clearedAt: { $in: [null, undefined] }, receiptDate: range }] })
    .project({ receiptNumber: 1, customerName: 1, receiptDate: 1, clearedAt: 1, tdsDeducted: 1, tdsSection: 1 })
    .toArray();
  return docs.map((d) => ({
    receiptId: String(d._id), receiptNumber: String(d.receiptNumber ?? ""), customerName: String(d.customerName ?? ""),
    date: dayOf((d.clearedAt as Date | null | undefined) ?? (d.receiptDate as Date)), tds: Number(d.tdsDeducted), section: typeof d.tdsSection === "string" && d.tdsSection.trim() ? d.tdsSection.trim() : null,
  }));
}

export interface TdsCreditsView {
  upload: Tds26asUpload;
  recon: Reconciliation;
}

/** The stored 26AS credits of the year compared with the receipts as they are now. Null when nothing has been uploaded for the year. */
export async function loadTdsCreditsView(fy: string): Promise<TdsCreditsView | null> {
  const upload = await getActiveUpload(fy);
  if (!upload) return null;
  const { rows } = await cols();
  const docs = await rows.find({ uploadId: upload._id, ...notDeleted }).sort({ date: 1, _id: 1 }).toArray();
  const entries: ParsedCredit[] = docs.map((d) => ({
    deductorName: d.deductorName, tan: d.tan, section: d.section, date: d.date, amountPaid: d.amountPaid,
    taxDeducted: d.taxDeducted, taxDeposited: d.taxDeposited, credit: d.credit,
  }));
  return { upload, recon: reconcileCredits(await loadBooksTds(fy), entries) };
}
