import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, escapeRegex, newId } from "@/lib/products/rankmax-ai/db";

/**
 * Append-only audit trail for the SEO product. There is deliberately no update
 * or delete export. `recordAudit` never throws — audit logging must not break
 * the primary mutation (mirrors `src/lib/playbook-ai/audit.ts`).
 */

export const AUDIT_ENTITIES = [
  "page",
  "metadata",
  "keyword",
  "keyword_group",
  "ranking",
  "issue",
  "task",
  "backlink",
  "competitor",
  "sitemap",
  "robots",
  "schema",
  "redirect",
  "audit_run",
  "integration",
  "settings",
  "export",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_ACTION_LABEL = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  import: "Imported",
  publish: "Published",
  unpublish: "Unpublished",
  run: "Ran",
  sync: "Synced",
  verify: "Verified",
  assign: "Assigned",
  status: "Status change",
  comment: "Commented",
  export: "Exported",
  settings: "Settings",
  notify: "Notified",
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
  /** Site path the change concerns, when there is one — so a page's own trail is one query. */
  path: string | null;
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
      collection.createIndex({ path: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ entity: 1, entityId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ actorId: 1, createdAt: -1 }).catch(() => {}),
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
  path?: string | null;
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
      path: entry.path ?? null,
      summary: entry.summary ?? null,
      metadata: entry.metadata ?? null,
      createdAt: new Date(),
    });
  } catch {
    // Audit logging must never break the primary mutation.
  }
}

/** Shallow diff of two flat-ish records into a "key: a → b" summary string. */
export function diffSummary(before: Record<string, unknown>, after: Record<string, unknown>, keys: string[]): string | null {
  const parts: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
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
  path?: string;
  entityId?: string;
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

function buildFilter(opts: ListAuditOptions): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (opts.path) filter.path = opts.path;
  if (opts.entityId) filter.entityId = opts.entityId;
  if (opts.action) filter.action = opts.action;
  if (opts.entity) filter.entity = opts.entity;
  if (opts.from || opts.to) {
    const range: Record<string, Date> = {};
    if (opts.from) range.$gte = new Date(`${opts.from}T00:00:00`);
    if (opts.to) range.$lte = new Date(`${opts.to}T23:59:59.999`);
    filter.createdAt = range;
  }
  if (opts.q) {
    const rx = new RegExp(escapeRegex(opts.q), "i");
    filter.$or = [{ entityLabel: rx }, { actorEmail: rx }, { summary: rx }, { path: rx }];
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

/** Un-paginated (capped) read for export. */
export async function exportAudit(opts: ListAuditOptions = {}, cap = 5000): Promise<AuditLog[]> {
  const collection = await getCollection();
  return collection.find(buildFilter(opts)).sort({ createdAt: -1 }).limit(cap).toArray();
}
