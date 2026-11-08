import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/clientos/db";

/** Append-only audit trail for portal accounts. Mirrors `src/lib/spendiq/audit.ts`. */

export const AUDIT_COLLECTION = "portal_activity_logs";

export type PortalAuditAction =
  | "register"
  | "login"
  | "logout"
  | "password_change"
  | "password_reset"
  | "document_download"
  | "profile_update";

export interface PortalAuditLog {
  _id: string;
  actorId: string;
  action: PortalAuditAction | string;
  entity: string;
  entityId: string;
  summary: string | null;
  ip: string | null;
  createdAt: Date;
}

let idx = false;

async function collection() {
  const db = await getDb();
  const c = db.collection<PortalAuditLog>(AUDIT_COLLECTION);
  if (!idx) {
    idx = true;
    await Promise.all([
      c.createIndex({ actorId: 1, createdAt: -1 }).catch(() => {}),
      c.createIndex({ createdAt: -1 }).catch(() => {}),
      c.createIndex({ createdAt: 1 }, { expireAfterSeconds: 180 * 86400 }).catch(() => {}),
    ]);
  }
  return c;
}

export async function recordPortalAudit(entry: {
  actorId: string;
  action: PortalAuditAction | string;
  entity: string;
  entityId: string;
  summary?: string | null;
  ip?: string | null;
}): Promise<void> {
  try {
    const c = await collection();
    await c.insertOne({
      _id: newId(),
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      summary: entry.summary ?? null,
      ip: entry.ip ?? null,
      createdAt: new Date(),
    });
  } catch {
    /* audit is best-effort */
  }
}
