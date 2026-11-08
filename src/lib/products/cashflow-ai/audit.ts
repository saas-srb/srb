import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/cashflow-ai/db";

/**
 * Append-only audit trail for every FMS mutation. Never updated or deleted.
 * Mirrors `src/lib/spendiq/audit.ts`. Satisfies §45: audit records must not be
 * editable by normal users — there is deliberately no update/delete export.
 */

export const AUDIT_LOGS_COLLECTION = "fms_activity_logs";

export type AuditEntity =
  | "transaction"
  | "account"
  | "customer"
  | "vendor"
  | "settings"
  | "invoice"
  | "receipt"
  | "refund"
  | "credit_note"
  | "debit_note"
  | "bank_account"
  | "cash_account"
  | "fund_transfer"
  | "bank_statement_line"
  | "cash_count"
  | "journal_entry"
  | "fiscal_period"
  | "payment_intent"
  | "payment_link"
  | "webhook_event"
  | "bank_statement"
  | "payment_reminders"
  | "payout"
  | "payment_controls"
  | "gateway_settlement"
  | "gstr2b_upload"
  | "tds_challan"
  | "it_notice"
  | "it_return"
  | "it_loss"
  | "it_schedule"
  | "it_payment"
  | "tds26as_upload"
  | "tds_lower_certificate"
  | "tds_certificate"
  | "compliance_item"
  | "compliance_filing";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "submit"
  | "approve"
  | "reject"
  | "status_change"
  | "cancel"
  | "reverse"
  | "reconcile"
  | "record"
  | "export"
  | "import"
  | "webhook_received"
  | "reminder_cron";

export interface AuditLog {
  _id: string;
  actorId: string;
  actorEmail: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityLabel: string | null;
  /** Free-form summary of what changed, e.g. "status: draft → pending_approval". */
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

export interface ListAuditOptions {
  entity?: AuditEntity;
  entityId?: string;
  actorId?: string;
  page?: number;
  pageSize?: number;
}

export async function listAudit(opts: ListAuditOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 40, 1), 100);

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

export function serializeAuditLog(log: AuditLog): SerializedAuditLog {
  return { ...log, createdAt: log.createdAt.toISOString() };
}
