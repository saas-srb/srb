import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, addDaysIso, todayIso } from "@/lib/products/cybervault/db";
import { getSettings } from "@/lib/products/cybervault/settings";
import { listDlmsManagerIds } from "@/lib/products/cybervault/access";
import { notifyDlmsUsers } from "@/lib/products/cybervault/notifications";
import { recordAudit } from "@/lib/products/cybervault/audit";

/**
 * Daily expiry sweep (called by `/api/cybervault/cron`). For every ACTIVE, non-deleted
 * credential / document / URL-account whose expiry is past or inside the warning
 * window, notify DLMS managers/admins. De-duplicated per record + urgency band
 * + ISO week, so a still-expiring record nags weekly at most, not daily.
 * Bodies contain record names only.
 */

const TYPES = [
  { type: "credential", collection: COLLECTIONS.credentials, path: "credentials" },
  { type: "document", collection: COLLECTIONS.documents, path: "documents" },
  { type: "link", collection: COLLECTIONS.links, path: "urls" },
] as const;

function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)}`;
}

export async function runExpirySweep(): Promise<{ skipped?: string; notified: number; expired: number; expiring: number }> {
  const settings = await getSettings();
  if (!settings.alertsEnabled) return { skipped: "alerts disabled", notified: 0, expired: 0, expiring: 0 };
  const recipients = await listDlmsManagerIds();
  if (recipients.length === 0) return { skipped: "no managers", notified: 0, expired: 0, expiring: 0 };

  const db = await getDb();
  const today = todayIso();
  const limit = addDaysIso(today, settings.warnDays);
  const week = isoWeek();
  let expired = 0;
  let expiring = 0;
  let notified = 0;

  for (const t of TYPES) {
    const rows = await db
      .collection<{ _id: string; name: string; scope: string; clientId: string | null; expiryDate: string | null }>(t.collection)
      .find({ deletedAt: null, status: "active", expiryDate: { $ne: null, $lte: limit } } as never, { projection: { name: 1, scope: 1, clientId: 1, expiryDate: 1 } })
      .limit(500)
      .toArray();
    for (const r of rows) {
      const isExpired = (r.expiryDate ?? "") < today;
      if (isExpired) expired++;
      else expiring++;
      await notifyDlmsUsers(recipients, {
        type: "dlms_expiry",
        title: isExpired ? `Expired: ${r.name}` : `Expiring soon: ${r.name}`,
        body: `${t.type === "link" ? "URL/account" : t.type} · ${r.scope === "company" ? "Company" : "Client"} · ${isExpired ? "expired" : "expires"} ${r.expiryDate}`,
        link: `/cybervault/expiry`,
        dedupeKey: `dlms-expiry:${t.type}:${r._id}:${isExpired ? "x" : "s"}:${week}`,
      });
      notified++;
    }
  }
  if (notified > 0) {
    await recordAudit({ actorId: "system", actorEmail: null, action: "alert", entity: "settings", entityId: "expiry-sweep", entityLabel: "Expiry sweep", summary: `Expiry sweep: ${expired} expired, ${expiring} expiring within ${settings.warnDays} days`, metadata: { expired, expiring } });
  }
  return { notified, expired, expiring };
}
