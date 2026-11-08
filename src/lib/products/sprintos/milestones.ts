import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/sprintos/db";
import { DEFAULT_MILESTONE_STATUS, type MilestoneStatus } from "@/lib/products/sprintos/constants";
import { TASKS_COLLECTION } from "@/lib/products/sprintos/tasks";

export const MILESTONES_COLLECTION = "pms_milestones";

export interface Milestone extends AuditFields {
  _id: string;
  projectId: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  status: MilestoneStatus;
  /** Manual progress used only when no tasks are linked. */
  manualProgressPercent: number;
  linkedTaskIds: string[];
  orderKey: number;
  completedAt: Date | null;
}

export interface MilestoneWithProgress extends Omit<Milestone, "createdAt" | "updatedAt" | "deletedAt" | "completedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  completedAt: string | null;
  /** Effective progress: task-derived when tasks are linked, else manual. */
  progressPercent: number;
  linkedTaskCount: number;
  linkedTaskDone: number;
  overdue: boolean;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Milestone>(MILESTONES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await collection.createIndex({ projectId: 1, orderKey: 1 }).catch(() => {});
  }
  return collection;
}

export async function getMilestone(id: string): Promise<Milestone | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function listMilestones(projectId: string): Promise<MilestoneWithProgress[]> {
  const collection = await getCollection();
  const rows = await collection.find({ projectId, ...notDeleted }).sort({ orderKey: 1, createdAt: 1 }).toArray();
  if (rows.length === 0) return [];

  const db = await getDb();
  const tasks = db.collection<{ _id: string; status: string }>(TASKS_COLLECTION);
  const allLinkedIds = Array.from(new Set(rows.flatMap((m) => m.linkedTaskIds)));
  const taskDocs = allLinkedIds.length
    ? await tasks.find({ _id: { $in: allLinkedIds }, deletedAt: null }, { projection: { status: 1 } }).toArray()
    : [];
  const statusById = new Map(taskDocs.map((t) => [t._id, t.status]));
  const today = new Date().toISOString().slice(0, 10);

  return rows.map((m) => {
    const linked = m.linkedTaskIds.filter((id) => statusById.has(id));
    const done = linked.filter((id) => statusById.get(id) === "done").length;
    const progressPercent =
      linked.length > 0
        ? Math.round((done / linked.length) * 100)
        : m.status === "completed"
          ? 100
          : m.manualProgressPercent;
    return {
      ...m,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
      completedAt: m.completedAt ? m.completedAt.toISOString() : null,
      progressPercent,
      linkedTaskCount: linked.length,
      linkedTaskDone: done,
      overdue: Boolean(m.dueDate && m.dueDate < today && m.status !== "completed"),
    };
  });
}

export interface MilestoneWriteData {
  name: string;
  description: string | null;
  dueDate: string | null;
  status: MilestoneStatus;
  manualProgressPercent: number;
  linkedTaskIds: string[];
}

async function nextOrderKey(projectId: string): Promise<number> {
  const collection = await getCollection();
  const last = await collection.find({ projectId, ...notDeleted }).sort({ orderKey: -1 }).limit(1).toArray();
  return (last[0]?.orderKey ?? 0) + 1024;
}

export async function createMilestone(
  projectId: string,
  data: MilestoneWriteData,
  actorId: string
): Promise<Milestone> {
  const collection = await getCollection();
  const status = data.status ?? DEFAULT_MILESTONE_STATUS;
  const doc: Milestone = {
    _id: newId(),
    projectId,
    name: data.name,
    description: data.description,
    dueDate: data.dueDate,
    status,
    manualProgressPercent: clamp(data.manualProgressPercent),
    linkedTaskIds: data.linkedTaskIds ?? [],
    orderKey: await nextOrderKey(projectId),
    completedAt: status === "completed" ? new Date() : null,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateMilestone(
  id: string,
  data: Partial<MilestoneWriteData>,
  actorId: string
): Promise<Milestone | null> {
  const collection = await getCollection();
  const set: Record<string, unknown> = { ...data, ...updateStamp(actorId) };
  if (typeof data.manualProgressPercent === "number") set.manualProgressPercent = clamp(data.manualProgressPercent);
  if (data.status !== undefined) set.completedAt = data.status === "completed" ? new Date() : null;
  return collection.findOneAndUpdate({ _id: id, ...notDeleted }, { $set: set }, { returnDocument: "after" });
}

export async function deleteMilestone(id: string, actorId: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
