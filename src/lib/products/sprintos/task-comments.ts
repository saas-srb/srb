import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, notDeleted } from "@/lib/products/sprintos/db";

export const TASK_COMMENTS_COLLECTION = "pms_task_comments";

export interface TaskComment {
  _id: string;
  taskId: string;
  projectId: string;
  authorId: string;
  authorEmail: string | null;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
}

export interface SerializedTaskComment extends Omit<TaskComment, "createdAt" | "editedAt" | "deletedAt"> {
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<TaskComment>(TASK_COMMENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await collection.createIndex({ taskId: 1, createdAt: 1 }).catch(() => {});
  }
  return collection;
}

export async function listComments(taskId: string): Promise<TaskComment[]> {
  const collection = await getCollection();
  return collection.find({ taskId, ...notDeleted }).sort({ createdAt: 1 }).toArray();
}

export async function countComments(taskId: string): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ taskId, ...notDeleted });
}

export async function addComment(
  input: { taskId: string; projectId: string; authorId: string; authorEmail: string | null; body: string }
): Promise<TaskComment> {
  const collection = await getCollection();
  const doc: TaskComment = {
    _id: newId(),
    taskId: input.taskId,
    projectId: input.projectId,
    authorId: input.authorId,
    authorEmail: input.authorEmail,
    body: input.body,
    createdAt: new Date(),
    editedAt: null,
    deletedAt: null,
  };
  await collection.insertOne(doc);
  return doc;
}

export async function editComment(id: string, authorId: string, body: string): Promise<TaskComment | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate(
    { _id: id, authorId, ...notDeleted },
    { $set: { body, editedAt: new Date() } },
    { returnDocument: "after" }
  );
}

export async function deleteComment(id: string, authorId: string, isAdmin: boolean): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const filter = isAdmin ? { _id: id, ...notDeleted } : { _id: id, authorId, ...notDeleted };
  const res = await collection.updateOne(filter, { $set: { deletedAt: new Date() } });
  return { ok: res.modifiedCount === 1 };
}

export function serializeComment(c: TaskComment): SerializedTaskComment {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
  };
}
