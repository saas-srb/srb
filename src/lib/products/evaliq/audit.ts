import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, newId, escapeRx } from "@/lib/products/evaliq/db";

/**
 * Append-only audit trail for the OTS product (tests, questions, assignments,
 * attempts, evaluation, results, certificates, exam security events). There
 * is deliberately no update or delete export. `recordAudit` never throws —
 * audit logging must not break the primary mutation. Answers, answer keys and
 * candidate responses are NEVER written here (`scrub` drops them).
 */

export const AUDIT_ENTITIES = ["test", "question", "category", "assignment", "attempt", "result", "certificate", "settings", "export"] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_ACTION_LABEL = {
  create: "Created",
  update: "Updated",
  duplicate: "Duplicated",
  delete: "Deleted",
  publish: "Published",
  close: "Closed",
  archive: "Archived",
  restore: "Restored",
  import: "Imported",
  export: "Exported",
  assign: "Assigned",
  assignment_update: "Assignment modified",
  cancel: "Cancelled",
  resync: "Re-synced targets",
  start: "Test started",
  resume: "Test resumed",
  submit: "Test submitted",
  auto_submit: "Auto submission",
  result_generated: "Result generated",
  evaluate: "Answer evaluated",
  marks_modified: "Marks modified",
  result_published: "Result published",
  certificate_generated: "Certificate generated",
  certificate_revoked: "Certificate revoked",
  certificate_restored: "Certificate restored",
  security_event: "Security event",
  expire: "Expired",
  settings: "Settings changed",
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
  /** The test this event belongs to, so a test's own trail is one indexed query. */
  testId: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

const SENSITIVE = /answer|response|correct|password|token|secret|key/i;
function scrub(meta: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!meta) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) if (!SENSITIVE.test(k)) out[k] = v;
  return Object.keys(out).length ? out : null;
}

export async function recordAudit(entry: {
  actorId: string;
  actorEmail?: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityLabel?: string | null;
  testId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.collection<AuditLog>(COLLECTIONS.audit).insertOne({
      _id: newId(),
      actorId: entry.actorId,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      entityLabel: entry.entityLabel ?? null,
      testId: entry.testId ?? (entry.entity === "test" ? entry.entityId : null),
      summary: entry.summary ?? null,
      metadata: scrub(entry.metadata),
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
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) parts.push(`${key}: ${fmt(before[key])} → ${fmt(after[key])}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "∅";
  if (value instanceof Date) return value.toISOString().slice(0, 16).replace("T", " ");
  if (Array.isArray(value)) return value.length ? value.join("/") : "∅";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 60);
  const s = String(value);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

export interface ListAuditOptions {
  testId?: string;
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
  if (opts.testId) filter.testId = opts.testId;
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
    const rx = new RegExp(escapeRx(opts.q), "i");
    filter.$or = [{ entityLabel: rx }, { actorEmail: rx }, { summary: rx }];
  }
  return filter;
}

export async function listAudit(opts: ListAuditOptions = {}) {
  const db = await getDb();
  const col = db.collection<AuditLog>(COLLECTIONS.audit);
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 40, 1), 100);
  const filter = buildFilter(opts);
  const [items, total] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    col.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function exportAudit(opts: ListAuditOptions = {}, cap = 5000): Promise<AuditLog[]> {
  const db = await getDb();
  return db.collection<AuditLog>(COLLECTIONS.audit).find(buildFilter(opts)).sort({ createdAt: -1 }).limit(cap).toArray();
}
