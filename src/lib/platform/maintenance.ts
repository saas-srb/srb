import { workspaceEvents } from "@/lib/notify/triggers/workspace";
import { forEachCompany, runAsCompany } from "@/lib/platform/tenancy/context";
import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { forgetMaintenanceState, getCompanyMaintenance, getMaintenanceState } from "@/lib/platform/maintenance-state";
import { MAINTENANCE_MAX_HOURS, MAINTENANCE_MAX_MESSAGE, maintenancePhase, type MaintenanceMode, type MaintenanceScope, type MaintenanceState } from "@/lib/platform/maintenance-shared";

export interface MaintenanceInput {
  enabled: boolean;
  message: string;
  mode: MaintenanceMode;
  appliesTo: MaintenanceScope;
  /** ISO string of the start; empty = starts now. */
  startsAt: string;
  /** How long it lasts, in hours (decimals allowed). */
  durationHours: number;
}

export type MaintenanceResult = { ok: true; state: MaintenanceState } | { ok: false; errors: Record<string, string> };

export async function saveMaintenance(input: MaintenanceInput, actorId: string, companyId?: string): Promise<MaintenanceResult> {
  const errors: Record<string, string> = {};
  const message = String(input.message ?? "").trim().replace(/\s+/g, " ");
  if (message.length > MAINTENANCE_MAX_MESSAGE) errors.message = `Keep it under ${MAINTENANCE_MAX_MESSAGE} characters.`;
  const mode: MaintenanceMode = input.mode === "banner" ? "banner" : "takeover";
  const appliesTo: MaintenanceScope = input.appliesTo === "sites" || input.appliesTo === "apps" ? input.appliesTo : "both";
  const hours = Number(input.durationHours);
  if (!Number.isFinite(hours) || hours < 0.05 || hours > MAINTENANCE_MAX_HOURS) errors.durationHours = `Enter between 3 minutes and ${MAINTENANCE_MAX_HOURS} hours.`;
  let start = Date.now();
  if (input.startsAt) {
    const t = new Date(input.startsAt).getTime();
    if (!Number.isFinite(t)) errors.startsAt = "Enter a valid start time.";
    else start = Math.max(t, Date.now() - 60_000);
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const end = start + hours * 3_600_000;
  const window = { enabled: Boolean(input.enabled), message, mode, appliesTo, startsAt: new Date(start), endsAt: new Date(end), updatedAt: new Date(), updatedBy: actorId };
  const db = await getPlatformDb();
  if (companyId) await db.collection("companies").updateOne({ _id: companyId as never }, { $set: { maintenance: window } });
  else await db.collection("platform_settings").updateOne({ _id: "maintenance" as never }, { $set: window }, { upsert: true });
  forgetMaintenanceState();
  if (window.enabled) {
    try {
      const tell = () => workspaceEvents.maintenance(message, window.startsAt, window.endsAt, mode);
      if (companyId) await runAsCompany(companyId, tell);
      else await forEachCompany(tell);
    } catch (err) {
      console.error("[maintenance] could not notify companies", err);
    }
  }
  await recordPlatformAudit({ actorId, companyId: companyId ?? null, action: companyId ? "company.maintenance.update" : "settings.maintenance.update", target: companyId ? { type: "company", id: companyId } : { type: "platform_settings", id: "maintenance" }, details: { enabled: Boolean(input.enabled), mode, appliesTo, startsAt: new Date(start).toISOString(), hours } });
  return { ok: true, state: companyId ? await getCompanyMaintenance(companyId) : await getMaintenanceState() };
}

/** Ends the window right now: every site and product is back within seconds. */
export async function endMaintenanceNow(actorId: string, companyId?: string): Promise<MaintenanceState> {
  const now = new Date();
  const db = await getPlatformDb();
  if (companyId) await db.collection("companies").updateOne({ _id: companyId as never }, { $set: { "maintenance.enabled": false, "maintenance.endsAt": now, "maintenance.updatedAt": now, "maintenance.updatedBy": actorId } });
  else await db.collection("platform_settings").updateOne({ _id: "maintenance" as never }, { $set: { enabled: false, endsAt: now, updatedAt: now, updatedBy: actorId } }, { upsert: true });
  forgetMaintenanceState();
  await recordPlatformAudit({ actorId, companyId: companyId ?? null, action: companyId ? "company.maintenance.end" : "settings.maintenance.end", target: companyId ? { type: "company", id: companyId } : { type: "platform_settings", id: "maintenance" }, details: {} });
  return companyId ? getCompanyMaintenance(companyId) : getMaintenanceState();
}

export { maintenancePhase };
