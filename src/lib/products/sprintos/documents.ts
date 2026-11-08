import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, notDeleted } from "@/lib/products/sprintos/db";
import { deleteDocumentFile, type StoredDocument } from "@/lib/products/sprintos/document-storage";
import { DEFAULT_DOCUMENT_CATEGORY, type PmsDocumentCategory } from "@/lib/products/sprintos/document-categories";

export const DOCUMENTS_COLLECTION = "pms_documents";

export interface ProjectDocument {
  _id: string;
  projectId: string;
  /** First version's _id — groups a document and its later versions. */
  rootId: string;
  category: PmsDocumentCategory;
  title: string;
  notes: string | null;
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  version: number;
  /** The _id of the version that replaced this one; null when current. */
  supersededById: string | null;
  uploadedBy: string;
  uploadedByEmail: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface SerializedDocument extends Omit<ProjectDocument, "createdAt" | "deletedAt"> {
  createdAt: string;
  deletedAt: string | null;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<ProjectDocument>(DOCUMENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ projectId: 1, category: 1 }).catch(() => {}),
      collection.createIndex({ rootId: 1, version: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function getDocument(id: string): Promise<ProjectDocument | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

/** Current (non-superseded) documents for a project. */
export async function listCurrentDocuments(projectId: string): Promise<ProjectDocument[]> {
  const collection = await getCollection();
  return collection
    .find({ projectId, supersededById: null, ...notDeleted })
    .sort({ category: 1, createdAt: -1 })
    .toArray();
}

export async function documentVersions(rootId: string): Promise<ProjectDocument[]> {
  const collection = await getCollection();
  return collection.find({ rootId, ...notDeleted }).sort({ version: -1 }).toArray();
}

export async function countDocuments(projectId: string): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ projectId, supersededById: null, ...notDeleted });
}

export async function addDocument(
  input: {
    projectId: string;
    category: PmsDocumentCategory;
    title: string;
    notes: string | null;
    uploadedBy: string;
    uploadedByEmail: string | null;
  },
  file: StoredDocument
): Promise<ProjectDocument> {
  const collection = await getCollection();
  const id = newId();
  const doc: ProjectDocument = {
    _id: id,
    projectId: input.projectId,
    rootId: id,
    category: input.category ?? DEFAULT_DOCUMENT_CATEGORY,
    title: input.title,
    notes: input.notes,
    storageKey: file.storageKey,
    filename: file.filename,
    contentType: file.contentType,
    size: file.size,
    version: 1,
    supersededById: null,
    uploadedBy: input.uploadedBy,
    uploadedByEmail: input.uploadedByEmail,
    createdAt: new Date(),
    deletedAt: null,
  };
  await collection.insertOne(doc);
  return doc;
}

/** Uploads a new version of an existing document and supersedes the current one. */
export async function replaceDocument(
  currentId: string,
  input: { title?: string; notes?: string | null; uploadedBy: string; uploadedByEmail: string | null },
  file: StoredDocument
): Promise<ProjectDocument | null> {
  const collection = await getCollection();
  const current = await collection.findOne({ _id: currentId, supersededById: null, ...notDeleted });
  if (!current) return null;

  const id = newId();
  const doc: ProjectDocument = {
    _id: id,
    projectId: current.projectId,
    rootId: current.rootId,
    category: current.category,
    title: input.title ?? current.title,
    notes: input.notes ?? current.notes,
    storageKey: file.storageKey,
    filename: file.filename,
    contentType: file.contentType,
    size: file.size,
    version: current.version + 1,
    supersededById: null,
    uploadedBy: input.uploadedBy,
    uploadedByEmail: input.uploadedByEmail,
    createdAt: new Date(),
    deletedAt: null,
  };
  await collection.insertOne(doc);
  await collection.updateOne({ _id: currentId }, { $set: { supersededById: id } });
  return doc;
}

/** Soft-deletes a document version and removes its file from disk. */
export async function deleteDocument(id: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const doc = await collection.findOne({ _id: id, ...notDeleted });
  if (!doc) return { ok: false };
  await collection.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
  // If this was current, promote the previous version back to current.
  if (doc.supersededById === null) {
    const prev = await collection
      .find({ rootId: doc.rootId, version: { $lt: doc.version }, ...notDeleted })
      .sort({ version: -1 })
      .limit(1)
      .toArray();
    if (prev[0]) await collection.updateOne({ _id: prev[0]._id }, { $set: { supersededById: null } });
  }
  await deleteDocumentFile(doc.storageKey);
  return { ok: true };
}

export function serializeDocument(d: ProjectDocument): SerializedDocument {
  return {
    ...d,
    createdAt: d.createdAt.toISOString(),
    deletedAt: d.deletedAt ? d.deletedAt.toISOString() : null,
  };
}
