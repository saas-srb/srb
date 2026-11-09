import "server-only";
import { getDb } from "@/lib/mongodb";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import { newId } from "@/lib/products/playbook-ai/db";
import { playbookCan } from "@/lib/playbook-roles";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";

/**
 * Append-only audit trail for Playbook documents (`pb_audit`). There is deliberately no update or delete export. `recordPbAudit` never
 * throws: audit logging must not break the action it describes.
 */

export const PB_AUDIT_ACTIONS = [
  "create", "edit", "page_settings", "save_version", "revert", "submit", "withdraw", "approve", "auto_approve", "reject", "revise", "issue",
  "archive", "restore", "delete", "undelete", "purge", "legal_hold", "lock", "unlock", "lock_broken", "variable_change", "link_change", "settings", "export", "legal_ack", "brand_change", "brand_asset", "template_create", "template_edit", "template_publish", "template_review", "template_archive", "template_restore", "template_ack", "send_for_signature", "signature_status",
] as const;
export type PbAuditAction = (typeof PB_AUDIT_ACTIONS)[number];
export type PbAuditEntity = "document" | "version" | "variable" | "brand" | "settings" | "template";

export interface PbAuditEntry {
  _id: string;
  actorId: string;
  actorEmail: string | null;
  action: PbAuditAction;
  entity: PbAuditEntity;
  entityId: string;
  documentId: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

let indexesEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<PbAuditEntry>(PB_COLLECTIONS.audit);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      c.createIndex({ documentId: 1, createdAt: -1 }).catch(() => {}),
      c.createIndex({ createdAt: -1 }).catch(() => {}),
      c.createIndex({ actorId: 1, createdAt: -1 }).catch(() => {}),
    ]);
  }
  return c;
}

/** Test hook: forget that indexes were created (after the test drops its database). */
export function resetPbAuditIndexes(): void {
  indexesEnsured = false;
}

export async function recordPbAudit(entry: {
  actor: Pick<PbActor, "id" | "email">;
  action: PbAuditAction;
  entity: PbAuditEntity;
  entityId: string;
  documentId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const c = await col();
    await c.insertOne({
      _id: newId(),
      actorId: entry.actor.id,
      actorEmail: entry.actor.email,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      documentId: entry.documentId ?? (entry.entity === "document" ? entry.entityId : null),
      summary: entry.summary ?? null,
      metadata: entry.metadata ?? null,
      createdAt: new Date(),
    });
  } catch {
    // Audit logging must never break the primary action.
  }
}

/** The trail of one document, newest first. Requires VIEW_AUDIT. */
export async function listPbAudit(actor: PbActor, opts: { documentId?: string; page?: number; pageSize?: number } = {}): Promise<{ ok: true; items: PbAuditEntry[]; total: number } | { ok: false }> {
  if (!playbookCan(actor, "VIEW_AUDIT")) return { ok: false };
  const c = await col();
  const filter = opts.documentId ? { documentId: opts.documentId } : {};
  const page = Math.max(opts.page ?? 1, 1);
  const size = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);
  const [items, total] = await Promise.all([
    c.find(filter).sort({ createdAt: -1 }).skip((page - 1) * size).limit(size).toArray(),
    c.countDocuments(filter),
  ]);
  return { ok: true, items, total };
}

/** Like `recordPbAudit`, but skips the entry when the same person logged the same action on the same document within `windowMs` (autosave). */
export async function recordPbAuditThrottled(entry: Parameters<typeof recordPbAudit>[0], windowMs = 10 * 60_000): Promise<void> {
  try {
    const c = await col();
    const recent = await c.findOne({
      actorId: entry.actor.id, action: entry.action, entityId: entry.entityId, createdAt: { $gt: new Date(Date.now() - windowMs) },
    });
    if (recent) return;
  } catch {
    return;
  }
  await recordPbAudit(entry);
}
