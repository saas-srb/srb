import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/sprintos/db";

/**
 * Append-only activity trail for every PMS mutation. Never updated or deleted.
 * Mirrors `src/lib/talentos/audit.ts`.
 */

export const ACTIVITY_LOGS_COLLECTION = "pms_activity_logs";

export type ActivityEntity =
  | "client"
  | "project"
  | "project_member"
  | "settings"
  | "task"
  | "task_comment"
  | "milestone";

export type ActivityAction =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "member_add"
  | "member_update"
  | "member_remove"
  | "progress_update"
  | "assign"
  | "comment"
  | "move";

export interface ActivityLog {
  _id: string;
  actorId: string;
  actorEmail: string | null;
  action: ActivityAction;
  entity: ActivityEntity;
  entityId: string;
  entityLabel: string | null;
  /** Free-form summary of what changed, e.g. "status: planning → in_progress". */
  summary: string | null;
  metadata: Record<string, unknown> | null;
  /** The project this activity belongs to, when applicable — powers the project timeline. */
  projectId: string | null;
  createdAt: Date;
}

export interface SerializedActivityLog extends Omit<ActivityLog, "createdAt"> {
  createdAt: string;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<ActivityLog>(ACTIVITY_LOGS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
      collection.createIndex({ entity: 1, entityId: 1 }).catch(() => {}),
      collection.createIndex({ projectId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ actorId: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function recordActivity(entry: {
  actorId: string;
  actorEmail?: string | null;
  action: ActivityAction;
  entity: ActivityEntity;
  entityId: string;
  entityLabel?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
  projectId?: string | null;
}): Promise<void> {
  try {
    const collection = await getCollection();
    await collection.insertOne({
      _id: newId(),
      actorId: entry.actorId,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      entityLabel: entry.entityLabel ?? null,
      summary: entry.summary ?? null,
      metadata: entry.metadata ?? null,
      projectId: entry.projectId ?? null,
      createdAt: new Date(),
    });
  } catch {
    // Activity logging must never break the primary mutation.
  }
}

/** Shallow diff of two flat-ish records into a "key: a → b" summary string. */
export function diffSummary(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: string[]
): string | null {
  const parts: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      parts.push(`${key}: ${fmt(before[key])} → ${fmt(after[key])}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "∅";
  if (Array.isArray(value)) return value.length ? value.join("/") : "∅";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export interface ListActivityOptions {
  entity?: ActivityEntity;
  entityId?: string;
  projectId?: string;
  actorId?: string;
  page?: number;
  pageSize?: number;
}

export async function listActivity(opts: ListActivityOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 30, 1), 100);

  const filter: Record<string, unknown> = {};
  if (opts.entity) filter.entity = opts.entity;
  if (opts.entityId) filter.entityId = opts.entityId;
  if (opts.projectId) filter.projectId = opts.projectId;
  if (opts.actorId) filter.actorId = opts.actorId;

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

/** Most recent N entries for one project — powers the project "Activity" tab. */
export async function recentActivityForProject(projectId: string, limit = 25): Promise<ActivityLog[]> {
  const collection = await getCollection();
  return collection.find({ projectId }).sort({ createdAt: -1 }).limit(limit).toArray();
}

export function serializeActivityLog(log: ActivityLog): SerializedActivityLog {
  return { ...log, createdAt: log.createdAt.toISOString() };
}
