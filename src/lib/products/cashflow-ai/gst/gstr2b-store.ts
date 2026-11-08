import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { isMonth, type InwardRow } from "@/lib/products/cashflow-ai/gst/core";
import { loadInwardRows, loadRegistration } from "@/lib/products/cashflow-ai/gst/store";
import {
  EXTRA_MONTHS_BACK,
  MAX_FILE_BYTES,
  monthsToCompare,
  parseGstr2b,
  reconcile,
  type ParsedNote,
  type ParsedRow,
  type Reconciliation,
  type RejectedReason,
} from "@/lib/products/cashflow-ai/gst/gstr2b-core";

/**
 * The GSTR-2B the company uploaded, per month. One upload per month is "active"; a new upload for the same month replaces it and the
 * older upload's details stay on record as "superseded" (its rows are dropped, the audit trail is not). The comparison with the bills
 * is NOT stored: it is worked out again on every read, so it always reflects the books today.
 */
export const GSTR2B_UPLOADS = "fms_gstr2b_uploads";
export const GSTR2B_ROWS = "fms_gstr2b_rows";

export interface Gstr2bUpload extends AuditFields {
  _id: string;
  period: string;
  fileName: string;
  sha256: string;
  source: "json" | "csv";
  rowCount: number;
  noteCount: number;
  rejectedCount: number;
  rejected: RejectedReason[];
  uploadedBy: string;
  status: "active" | "superseded";
  supersededAt: Date | null;
  supersededBy: string | null;
}

type RowDoc = AuditFields & ({ _id: string; uploadId: string; period: string; kind: "invoice" } & ParsedRow | { _id: string; uploadId: string; period: string; kind: "note" } & ParsedNote);

let indexesEnsured = false;
async function cols() {
  const db = await getDb();
  const uploads = db.collection<Gstr2bUpload>(GSTR2B_UPLOADS);
  const rows = db.collection<RowDoc>(GSTR2B_ROWS);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      uploads.createIndex({ period: 1, status: 1, createdAt: -1 }).catch(() => {}),
      rows.createIndex({ uploadId: 1 }).catch(() => {}),
    ]);
  }
  return { uploads, rows };
}

export type SaveResult = { ok: true; uploadId: string; replaced: boolean; rows: number; notes: number; rejectedCount: number } | { ok: false; error: string };

export async function saveGstr2bUpload(
  input: { month: string; fileName: string; text: string },
  actor: { id: string; email: string | null }
): Promise<SaveResult> {
  if (!isMonth(input.month)) return { ok: false, error: "Choose a month." };
  if (typeof input.text !== "string" || Buffer.byteLength(input.text, "utf8") > MAX_FILE_BYTES) return { ok: false, error: "The file is larger than 5 MB." };
  const reg = await loadRegistration();
  if (!reg.gstin) return { ok: false, error: "Add your company's GSTIN in Settings first, so the file can be checked as yours." };
  const parsed = parseGstr2b(input.text, { month: input.month, companyGstin: reg.gstin });
  if (!parsed.ok) return parsed;

  const sha256 = createHash("sha256").update(input.text).digest("hex");
  const { uploads, rows } = await cols();
  const active = await uploads.find({ period: input.month, status: "active", ...notDeleted }).toArray();
  if (active.some((u) => u.sha256 === sha256)) return { ok: false, error: "This exact file is already loaded for this month." };

  const id = newId();
  const stamp = createStamp(actor.id);
  const docs: RowDoc[] = [
    ...parsed.rows.map((r) => ({ _id: newId(), uploadId: id, period: input.month, kind: "invoice" as const, ...r, ...stamp })),
    ...parsed.notes.map((n) => ({ _id: newId(), uploadId: id, period: input.month, kind: "note" as const, ...n, ...stamp })),
  ];
  // rows first, then the upload record: until the record exists nobody reads these rows, so a failure half-way leaves nothing visible
  for (let i = 0; i < docs.length; i += 1000) await rows.insertMany(docs.slice(i, i + 1000) as never);
  const fileName = (input.fileName || "upload").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 200);
  await uploads.insertOne({
    _id: id, period: input.month, fileName, sha256, source: parsed.source, rowCount: parsed.rows.length, noteCount: parsed.notes.length,
    rejectedCount: parsed.rejectedCount, rejected: parsed.rejected, uploadedBy: actor.id, status: "active", supersededAt: null, supersededBy: null, ...stamp,
  });
  // retire every earlier active upload of the month; only EARLIER ones, so two uploads racing cannot retire each other
  const retire = await uploads.find({ period: input.month, status: "active", _id: { $ne: id }, createdAt: { $lt: stamp.createdAt }, ...notDeleted }).toArray();
  const retireIds = retire.map((u) => u._id);
  if (retireIds.length) {
    await uploads.updateMany({ _id: { $in: retireIds } }, { $set: { status: "superseded", supersededAt: new Date(), supersededBy: id, ...updateStamp(actor.id) } });
    await rows.deleteMany({ uploadId: { $in: retireIds } });
  }
  await recordAudit({
    actorId: actor.id, actorEmail: actor.email, action: "import", entity: "gstr2b_upload", entityId: id, entityLabel: `GSTR-2B ${input.month}`,
    summary: `GSTR-2B for ${input.month} loaded from ${fileName}: ${parsed.rows.length} invoices, ${parsed.notes.length} notes, ${parsed.rejectedCount} rows not read${retireIds.length ? " (replaces the earlier upload)" : ""}`,
    metadata: { sha256, source: parsed.source },
  });
  return { ok: true, uploadId: id, replaced: retireIds.length > 0, rows: parsed.rows.length, notes: parsed.notes.length, rejectedCount: parsed.rejectedCount };
}

export async function getActiveUpload(month: string): Promise<Gstr2bUpload | null> {
  if (!isMonth(month)) return null;
  const { uploads } = await cols();
  const list = await uploads.find({ period: month, status: "active", ...notDeleted }).sort({ createdAt: -1 }).limit(1).toArray();
  return list[0] ?? null;
}

export async function listSupersededUploads(month: string): Promise<Gstr2bUpload[]> {
  if (!isMonth(month)) return [];
  const { uploads } = await cols();
  return uploads.find({ period: month, status: "superseded", ...notDeleted }).sort({ createdAt: -1 }).limit(20).toArray();
}

export interface Gstr2bView {
  upload: Gstr2bUpload;
  notes: ParsedNote[];
  recon: Reconciliation;
  /** The months of bills that were compared. */
  comparedMonths: string[];
  twoBRows: number;
}

const strip = <T extends Record<string, unknown>>(d: T) => {
  const { _id, uploadId, period, kind, createdAt, updatedAt, createdBy, updatedBy, deletedAt, ...rest } = d as Record<string, unknown>;
  void _id; void uploadId; void period; void kind; void createdAt; void updatedAt; void createdBy; void updatedBy; void deletedAt;
  return rest;
};

/** The stored GSTR-2B of the month, compared with the bills of that month and the EXTRA_MONTHS_BACK before it, as the books stand now. */
export async function loadGstr2bView(month: string): Promise<Gstr2bView | null> {
  const upload = await getActiveUpload(month);
  if (!upload) return null;
  const { rows } = await cols();
  const docs = await rows.find({ uploadId: upload._id, ...notDeleted }).toArray();
  const invoices = docs.filter((d) => d.kind === "invoice").map((d) => strip(d) as unknown as ParsedRow);
  const notes = docs.filter((d) => d.kind === "note").map((d) => strip(d) as unknown as ParsedNote);
  const comparedMonths = monthsToCompare(month, EXTRA_MONTHS_BACK);
  const reg = await loadRegistration();
  const perMonth = await Promise.all(comparedMonths.map(async (m) => ({ m, books: await loadInwardRows(m, reg) })));
  // A bill already found in an EARLIER month's statement is settled there: it must not show up again as "missing" in this month's.
  const settledEarlier = new Set<string>();
  for (const { m, books: monthBooks } of perMonth) {
    if (m === month) continue;
    const earlier = await getActiveUpload(m);
    if (!earlier) continue;
    const earlierRows = (await rows.find({ uploadId: earlier._id, kind: "invoice", ...notDeleted }).toArray()).map((d) => strip(d) as unknown as ParsedRow);
    for (const r of reconcile(earlierRows, monthBooks).rows) if (r.book && (r.status === "matched" || r.status === "amount_differs")) settledEarlier.add(r.book.billId);
  }
  const books: InwardRow[] = perMonth.flatMap((x) => x.books).filter((b) => !settledEarlier.has(b.billId));
  return { upload, notes, recon: reconcile(invoices, books), comparedMonths, twoBRows: invoices.length };
}
