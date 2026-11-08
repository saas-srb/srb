import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, newId } from "@/lib/products/playbook-ai/db";

/**
 * Append-only audit trail for the SOP product. There is deliberately no update
 * or delete export. `recordAudit` never throws — audit logging must not break
 * the primary mutation (mirrors `src/lib/cashflow-ai/audit.ts`).
 */

export type AuditEntity =
  | "sop"
  | "version"
  | "assignment"
  | "file"
  | "feedback"
  | "template"
  | "category"
  | "department"
  | "function"
  | "process"
  | "settings"
  | "export";

export type AuditAction =
  | "create"
  | "edit"
  | "publish"
  | "update"
  | "assign"
  | "view"
  | "download"
  | "acknowledge"
  | "archive"
  | "restore"
  | "delete"
  | "revert"
  | "feedback"
  | "checklist"
  | "reminder"
  | "export"
  | "settings"
  | "config"
  | "status_auto";

export interface AuditLog {
  _id: string;
  actorId: string;
  actorEmail: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityLabel: string | null;
  /** The owning SOP (for entity=sop/version/assignment/file/feedback) so a SOP's own trail is one indexed query. */
  sopId: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface SerializedAuditLog extends Omit<AuditLog, "createdAt"> {
  createdAt: string;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<AuditLog>(COLLECTIONS.audit);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
      collection.createIndex({ sopId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ actorId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ action: 1, createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function recordAudit(entry: {
  actorId: string;
  actorEmail?: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityLabel?: string | null;
  sopId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
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
      sopId: entry.sopId ?? (entry.entity === "sop" ? entry.entityId : null),
      summary: entry.summary ?? null,
      metadata: entry.metadata ?? null,
      createdAt: new Date(),
    });
  } catch {
    // Audit logging must never break the primary mutation.
  }
}

/**
 * Logs a "view"/"download" at most once per actor+SOP+action per window, so
 * refreshing a page does not flood the trail. Best-effort like `recordAudit`.
 */
export async function recordAuditThrottled(
  entry: Parameters<typeof recordAudit>[0],
  windowMs = 30 * 60 * 1000
): Promise<void> {
  try {
    const collection = await getCollection();
    const recent = await collection.findOne({
      actorId: entry.actorId,
      action: entry.action,
      entityId: entry.entityId,
      createdAt: { $gt: new Date(Date.now() - windowMs) },
    });
    if (recent) return;
  } catch {
    return;
  }
  await recordAudit(entry);
}

/** Shallow diff of two flat-ish records into a "key: a → b" summary string. */
export function diffSummary(before: Record<string, unknown>, after: Record<string, unknown>, keys: string[]): string | null {
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
  const s = String(value);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

export interface ListAuditOptions {
  sopId?: string;
  actorId?: string;
  action?: string;
  entity?: string;
  from?: string; // ISO date
  to?: string; // ISO date
  q?: string;
  page?: number;
  pageSize?: number;
}

function buildFilter(opts: ListAuditOptions): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (opts.sopId) filter.sopId = opts.sopId;
  if (opts.actorId) filter.actorId = opts.actorId;
  if (opts.action) filter.action = opts.action;
  if (opts.entity) filter.entity = opts.entity;
  if (opts.from || opts.to) {
    const range: Record<string, Date> = {};
    if (opts.from) range.$gte = new Date(`${opts.from}T00:00:00`);
    if (opts.to) range.$lte = new Date(`${opts.to}T23:59:59.999`);
    filter.createdAt = range;
  }
  if (opts.q) {
    const rx = new RegExp(opts.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ entityLabel: rx }, { actorEmail: rx }, { summary: rx }];
  }
  return filter;
}

export async function listAudit(opts: ListAuditOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 40, 1), 100);
  const filter = buildFilter(opts);
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

/** Un-paginated (capped) read for CSV export. */
export async function exportAudit(opts: ListAuditOptions = {}, cap = 5000): Promise<AuditLog[]> {
  const collection = await getCollection();
  return collection.find(buildFilter(opts)).sort({ createdAt: -1 }).limit(cap).toArray();
}

export function serializeAuditLog(log: AuditLog): SerializedAuditLog {
  return { ...log, createdAt: log.createdAt.toISOString() };
}
