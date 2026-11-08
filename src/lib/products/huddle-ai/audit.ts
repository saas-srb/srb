import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/huddle-ai/db";

/**
 * Append-only audit trail for security-relevant Messenger actions (channel
 * create / archive, member add / remove / role change, message moderation,
 * settings changes, file access denials). Never updated or deleted. Mirrors
 * `src/lib/spendiq/audit.ts`.
 */

export const AUDIT_LOGS_COLLECTION = "chat_activity_logs";

export type AuditEntity =
  | "channel"
  | "channel_member"
  | "message"
  | "direct_conversation"
  | "settings"
  | "file"
  | "announcement"
  | "meeting";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "publish"
  | "archive"
  | "unarchive"
  | "join"
  | "add_member"
  | "remove_member"
  | "role_change"
  | "delete_message"
  | "pin"
  | "unpin"
  | "access_denied";

export interface AuditLog {
  _id: string;
  actorId: string;
  actorEmail: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityLabel: string | null;
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
