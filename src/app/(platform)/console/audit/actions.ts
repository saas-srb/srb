"use server";

import { checkPlatformPermission } from "@/lib/platform/console/access";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { exportAuditCsv, type AuditFilters } from "@/lib/platform/console/audit-log";

export async function exportAuditCsvAction(filters: AuditFilters): Promise<{ ok: true; csv: string; rows: number; truncated: boolean } | { ok: false; error: string }> {
  const auth = await checkPlatformPermission("audit.read");
  if (!auth.ok) return auth;
  const f: AuditFilters = {
    actorId: filters?.actorId ? String(filters.actorId) : undefined,
    actionPrefix: filters?.actionPrefix ? String(filters.actionPrefix) : undefined,
    companyId: filters?.companyId ? String(filters.companyId) : undefined,
    from: filters?.from ? String(filters.from) : undefined,
    to: filters?.to ? String(filters.to) : undefined,
    q: filters?.q ? String(filters.q).slice(0, 200) : undefined,
  };
  const res = await exportAuditCsv(f);
  await recordPlatformAudit({ actorId: auth.user.id, action: "audit.export", target: { type: "platform_audit_log", id: "csv" }, details: { filters: f, rows: res.rows } });
  return { ok: true, ...res };
}
