import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/talentos/db";

/**
 * Append-only audit trail for every HRMS mutation. Never updated or deleted.
 */

export const AUDIT_LOGS_COLLECTION = "hrms_audit_logs";

export type AuditEntity =
  | "employee"
  | "department"
  | "designation"
  | "team"
  | "payroll_profile"
  | "user_role"
  | "attendance"
  | "leave_request"
  | "leave_type"
  | "holiday"
  | "org_settings"
  | "payroll_run"
  | "payslip"
  | "payroll_config"
  | "salary_revision"
  | "employee_document"
  | "employee_login"
  | "offer"
  | "bank_account"
  | "salary_payout"
  | "company"
  | "payroll_item"
  | "work_request"
  | "statutory_payment"
  | "tax_declaration";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "convert_from_applicant"
  | "role_grant"
  | "approve"
  | "reject"
  | "cancel"
  | "bulk_mark"
  | "generate"
  | "pay"
  | "clock_in"
  | "clock_out"
  | "view_sensitive"
  | "initiate"
  | "reconcile"
  | "verify";

export interface AuditLog {
  _id: string;
  actorId: string;
  actorEmail: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityLabel: string | null;
  /** Free-form summary of what changed, e.g. "status: active -> relieved". */
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
  const collection = db.collection<AuditLog>(AUDIT_LOGS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
      collection.createIndex({ entity: 1, entityId: 1 }).catch(() => {}),
      collection.createIndex({ actorId: 1 }).catch(() => {}),
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
      summary: entry.summary ?? null,
      metadata: entry.metadata ?? null,
      createdAt: new Date(),
    });
  } catch {
    // Audit logging must never break the primary mutation.
  }
}

/** Shallow diff of two flat-ish records into a "key: a -> b" summary string. */
export function diffSummary(before: Record<string, unknown>, after: Record<string, unknown>, keys: string[]): string | null {
  const parts: string[] = [];
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      parts.push(`${key}: ${format(a)} → ${format(b)}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function format(value: unknown): string {
  if (value === null || value === undefined || value === "") return "∅";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export interface ListAuditOptions {
  entity?: AuditEntity;
  entityId?: string;
  actorId?: string;
  page?: number;
  pageSize?: number;
}

export async function listAuditLogs(opts: ListAuditOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 30, 1), 100);

  const filter: Record<string, unknown> = {};
  if (opts.entity) filter.entity = opts.entity;
  if (opts.entityId) filter.entityId = opts.entityId;
  if (opts.actorId) filter.actorId = opts.actorId;

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

/** The most recent N entries for one entity — powers the profile "Activity" tab. */
export async function recentActivityFor(entity: AuditEntity, entityId: string, limit = 20): Promise<AuditLog[]> {
  const collection = await getCollection();
  return collection.find({ entity, entityId }).sort({ createdAt: -1 }).limit(limit).toArray();
}

export function serializeAuditLog(log: AuditLog): SerializedAuditLog {
  return { ...log, createdAt: log.createdAt.toISOString() };
}
