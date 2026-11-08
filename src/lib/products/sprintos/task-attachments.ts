import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, notDeleted } from "@/lib/products/sprintos/db";
import { deleteAttachmentFile, type StoredAttachment } from "@/lib/products/sprintos/attachment-storage";

export const TASK_ATTACHMENTS_COLLECTION = "pms_task_attachments";

export interface TaskAttachment {
  _id: string;
  taskId: string;
  projectId: string;
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedByEmail: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface SerializedAttachment extends Omit<TaskAttachment, "createdAt" | "deletedAt"> {
  createdAt: string;
  deletedAt: string | null;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<TaskAttachment>(TASK_ATTACHMENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await collection.createIndex({ taskId: 1, createdAt: -1 }).catch(() => {});
  }
  return collection;
}

export async function listAttachments(taskId: string): Promise<TaskAttachment[]> {
  const collection = await getCollection();
  return collection.find({ taskId, ...notDeleted }).sort({ createdAt: -1 }).toArray();
}

export async function countAttachments(taskId: string): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ taskId, ...notDeleted });
}

export async function getAttachment(id: string): Promise<TaskAttachment | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function addAttachment(
  input: { taskId: string; projectId: string; uploadedBy: string; uploadedByEmail: string | null },
  file: StoredAttachment
): Promise<TaskAttachment> {
  const collection = await getCollection();
  const doc: TaskAttachment = {
    _id: newId(),
    taskId: input.taskId,
    projectId: input.projectId,
    storageKey: file.storageKey,
    filename: file.filename,
    contentType: file.contentType,
    size: file.size,
    uploadedBy: input.uploadedBy,
    uploadedByEmail: input.uploadedByEmail,
    createdAt: new Date(),
    deletedAt: null,
  };
  await collection.insertOne(doc);
  return doc;
}

export async function deleteAttachment(id: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const doc = await collection.findOne({ _id: id, ...notDeleted });
  if (!doc) return { ok: false };
  await collection.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
  await deleteAttachmentFile(doc.storageKey);
  return { ok: true };
}

export function serializeAttachment(a: TaskAttachment): SerializedAttachment {
  return { ...a, createdAt: a.createdAt.toISOString(), deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null };
}
