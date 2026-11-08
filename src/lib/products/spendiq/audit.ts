import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/spendiq/db";

/**
 * Append-only audit trail for every PRMS mutation. Never updated or deleted.
 * Mirrors `src/lib/cohort-ai/audit.ts`.
 */

export const AUDIT_LOGS_COLLECTION = "prms_activity_logs";

export type AuditEntity =
  | "vendor"
  | "requisition"
  | "rfq"
  | "quotation"
  | "purchase_order"
  | "goods_receipt"
  | "expense"
  | "expense_category"
  | "asset"
  | "asset_assignment"
  | "inventory_item"
  | "inventory_transaction"
  | "infrastructure"
  | "subscription"
  | "third_party_service"
  | "invoice"
  | "payment"
  | "contract"
  | "budget"
  | "settings";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "submit"
  | "approve"
  | "reject"
  | "status_change"
  | "convert"
  | "receive"
  | "assign"
  | "return"
  | "record"
  | "match"
  | "renew";

export interface AuditLog {
  _id: string;
  actorId: string;
  actorEmail: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityLabel: string | null;
  /** Free-form summary of what changed, e.g. "status: draft → submitted". */
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
