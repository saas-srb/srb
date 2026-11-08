import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";

/**
 * The platform audit log (`platform_audit_log`): every change made in the
 * Platform Console, and every billing event that changes a company's access.
 * Write with `recordPlatformAudit`; never let a failed write break the action.
 */

export const PLATFORM_AUDIT_COLLECTION = "platform_audit_log";

export interface PlatformAuditEntry {
  _id?: string;
  at: Date;
  /** admin_users id, or "system" for webhooks and cron jobs. */
  actorId: string;
  /** Dotted verb, e.g. "plan.update", "company.suspend", "coupon.create", "settings.billing.update". */
  action: string;
  target: { type: string; id: string };
  /** The company affected, when there is one. */
  companyId?: string | null;
  /** Small, secret-free detail (changed fields, old → new status). Never keys or passwords. */
  details?: Record<string, unknown>;
}

export async function recordPlatformAudit(entry: Omit<PlatformAuditEntry, "_id" | "at">): Promise<void> {
  try {
    const db = await getPlatformDb();
    await db.collection(PLATFORM_AUDIT_COLLECTION).insertOne({ ...entry, companyId: entry.companyId ?? null, at: new Date() });
  } catch (err) {
    console.error("[platform-audit] write failed", entry.action, err);
  }
}
