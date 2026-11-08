import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, escapeRegex, newId } from "@/lib/products/viralpulse-ai/db";

/**
 * Append-only activity log for Social Media (SMMS). There is deliberately no update or delete
 * export. `recordAudit` never throws — logging must not break the primary
 * mutation (mirrors `lib/agentos/audit.ts`).
 *
 * Generated content, OAuth tokens and API keys never enter this log: entries carry names and ids
 * only, and `metadata` is scrubbed of any secret-looking key (see `scrub`).
 */

export const AUDIT_ENTITIES = ["campaign", "ad", "post", "media", "ai", "integration", "settings", "ugc"] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_ACTION_LABEL = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  upload: "Uploaded",
  replace: "New version",
  generate: "AI generated",
  regenerate: "AI regenerated",
  restore: "Version restored",
  duplicate: "Duplicated",
  status: "Status changed",
  schedule: "Scheduled",
  unschedule: "Unscheduled",
  approve: "Approved to publish",
  publish: "Published",
  publish_failed: "Publish failed",
  archive: "Archived",
  unarchive: "Restored",
  metrics: "Metrics updated",
  connect: "Connected",
  disconnect: "Disconnected",
  settings: "Settings",
} as const;
export type AuditAction = keyof typeof AUDIT_ACTION_LABEL;

export interface AuditLog {
  _id: string;
  actorId: string;
  actorEmail: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityLabel: string | null;
  /** The campaign/post the entry concerns (ads carry their campaign) — so the log can be filtered per record. */
  recordId: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<AuditLog>(COLLECTIONS.audit);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
      collection.createIndex({ entity: 1, entityId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ actorId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ recordId: 1, createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

const SECRET_KEY = /pass|secret|token|key|credential|enc|cipher|otp|pin/i;

/** Drops any metadata key that could hold a secret, and any non-primitive value. */
function scrub(meta: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!meta) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEY.test(k)) continue;
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[k] = typeof v === "string" ? v.slice(0, 200) : v;
  }
  return Object.keys(out).length ? out : null;
}

export async function recordAudit(entry: {
  actorId: string;
  actorEmail?: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityLabel?: string | null;
  recordId?: string | null;
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
      recordId: entry.recordId ?? null,
      summary: entry.summary ? entry.summary.slice(0, 300) : null,
      metadata: scrub(entry.metadata),
      createdAt: new Date(),
    });
  } catch {
    // Logging must never break the primary mutation.
  }
}

/** Logs a "view"/"download" at most once per actor+entity+action per window so refreshes don't flood the log. */
export async function recordAuditThrottled(entry: Parameters<typeof recordAudit>[0], windowMs: number): Promise<void> {
  try {
    const collection = await getCollection();
    const recent = await collection.findOne({
      actorId: entry.actorId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      createdAt: { $gt: new Date(Date.now() - windowMs) },
    });
    if (recent) return;
  } catch {
    return;
  }
  await recordAudit(entry);
}

/** "field: a → b" summary of the NON-SECRET fields that changed. Values are trimmed; secrets are never passed here. */
export function diffSummary(before: Record<string, unknown>, after: Record<string, unknown>, keys: string[]): string | null {
  const parts: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) parts.push(`${key}: ${fmt(before[key])} → ${fmt(after[key])}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "∅";
  const s = String(value);
  return s.length > 40 ? `${s.slice(0, 37)}…` : s;
}

export interface ListAuditOptions {
  action?: string;
  entity?: string;
  recordId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

function buildFilter(opts: ListAuditOptions): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (opts.action) filter.action = opts.action;
  if (opts.entity) filter.entity = opts.entity;
  if (opts.recordId) filter.recordId = opts.recordId;
  if (opts.actorId) filter.actorId = opts.actorId;
  if (opts.from || opts.to) {
    const range: Record<string, Date> = {};
    if (opts.from) range.$gte = new Date(`${opts.from}T00:00:00`);
    if (opts.to) range.$lte = new Date(`${opts.to}T23:59:59.999`);
    filter.createdAt = range;
  }
  if (opts.q) {
    const rx = new RegExp(escapeRegex(opts.q), "i");
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

export async function recentActivity(opts: ListAuditOptions & { limit?: number }): Promise<AuditLog[]> {
  const collection = await getCollection();
  return collection.find(buildFilter(opts)).sort({ createdAt: -1 }).limit(opts.limit ?? 8).toArray();
}
