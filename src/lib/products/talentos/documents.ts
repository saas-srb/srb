import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/talentos/db";
import { saveDocumentFile, deleteDocumentFile, type StoredDocument } from "@/lib/products/talentos/document-storage";
import { type DocumentCategory } from "@/lib/products/talentos/document-categories";
import { todayDateString } from "@/lib/products/talentos/time";

export const EMPLOYEE_DOCUMENTS_COLLECTION = "hrms_employee_documents";

export interface EmployeeDocument extends AuditFields {
  _id: string;
  employeeId: string;
  category: DocumentCategory;
  title: string;
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  issuedDate: string | null;
  expiryDate: string | null;
  version: number;
  /** Set on the OLD document when a newer version replaces it. */
  supersededById: string | null;
  uploadedBy: string;
  uploadedByRole: "staff" | "employee";
}

export interface SerializedEmployeeDocument extends Omit<EmployeeDocument, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<EmployeeDocument>(EMPLOYEE_DOCUMENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ employeeId: 1, category: 1 }).catch(() => {}),
      collection.createIndex({ expiryDate: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export function serializeDocument(d: EmployeeDocument): SerializedEmployeeDocument {
  return {
    ...d,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    deletedAt: d.deletedAt ? d.deletedAt.toISOString() : null,
  };
}

export async function getDocument(id: string): Promise<EmployeeDocument | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function listDocuments(
  employeeId: string,
  opts: { includeSuperseded?: boolean } = {}
): Promise<EmployeeDocument[]> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { employeeId, ...notDeleted };
  if (!opts.includeSuperseded) filter.supersededById = null;
  return collection.find(filter).sort({ category: 1, createdAt: -1 }).toArray();
}

export async function documentCountsForEmployees(ids: string[]): Promise<Map<string, number>> {
  const collection = await getCollection();
  const rows = await collection
    .aggregate<{ _id: string; count: number }>([
      { $match: { employeeId: { $in: ids }, deletedAt: null, supersededById: null } },
      { $group: { _id: "$employeeId", count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id, r.count]));
}

export interface UploadDocumentInput {
  employeeId: string;
  category: DocumentCategory;
  title: string;
  issuedDate: string | null;
  expiryDate: string | null;
  /** When set, this upload supersedes an existing document (version bump). */
  replacesId?: string;
}

export async function uploadDocument(
  input: UploadDocumentInput,
  file: File,
  actor: { id: string; role: "staff" | "employee" }
): Promise<{ ok: true; document: EmployeeDocument } | { ok: false; error: string }> {
  const collection = await getCollection();

  let version = 1;
  let previous: EmployeeDocument | null = null;
  if (input.replacesId) {
    previous = await collection.findOne({ _id: input.replacesId, employeeId: input.employeeId, ...notDeleted });
    if (!previous) return { ok: false, error: "The document being replaced no longer exists." };
    version = previous.version + 1;
  }

  let stored: StoredDocument;
  try {
    stored = await saveDocumentFile(file);
  } catch {
    return { ok: false, error: "Could not store the file. Please try again." };
  }

  const doc: EmployeeDocument = {
    _id: newId(),
    employeeId: input.employeeId,
    category: input.category,
    title: input.title,
    storageKey: stored.storageKey,
    filename: stored.filename,
    contentType: stored.contentType,
    size: stored.size,
    issuedDate: input.issuedDate,
    expiryDate: input.expiryDate,
    version,
    supersededById: null,
    uploadedBy: actor.id,
    uploadedByRole: actor.role,
    ...createStamp(actor.id),
  };
  await collection.insertOne(doc);

  if (previous) {
    await collection.updateOne({ _id: previous._id }, { $set: { supersededById: doc._id, ...updateStamp(actor.id) } });
  }

  return { ok: true, document: doc };
}

export async function updateDocumentMeta(
  id: string,
  data: { title?: string; category?: DocumentCategory; issuedDate?: string | null; expiryDate?: string | null },
  actorId: string
): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne({ _id: id, ...notDeleted }, { $set: { ...data, ...updateStamp(actorId) } });
  return res.matchedCount === 1;
}

export async function deleteDocument(id: string, actorId: string): Promise<boolean> {
  const collection = await getCollection();
  const doc = await collection.findOne({ _id: id, ...notDeleted });
  if (!doc) return false;
  await collection.updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  // Free disk immediately — the row is retained for audit.
  await deleteDocumentFile(doc.storageKey);
  return true;
}

/** For the Phase 2b-ii expiry-notification generator. */
export async function expiringDocuments(withinDays: number): Promise<EmployeeDocument[]> {
  const collection = await getCollection();
  const today = todayDateString();
  const limit = new Date(Date.now() + withinDays * 86400000).toISOString().slice(0, 10);
  return collection
    .find({ expiryDate: { $ne: null, $gte: today, $lte: limit }, supersededById: null, ...notDeleted })
    .sort({ expiryDate: 1 })
    .toArray();
}
