import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { MAINTENANCE_OFF, maintenancePhase, type MaintenanceState } from "@/lib/platform/maintenance-shared";

/**
 * Reads the maintenance window for the proxy and the root layout, which run on every request: kept in memory for a few seconds per server
 * instance (shared across bundles on globalThis). A save busts it here; other instances follow within the TTL. Fails open (no maintenance).
 */
const TTL_MS = 5_000;
const g = globalThis as unknown as { __platformMaintenance?: { value: MaintenanceState; at: number }; __companyMaintenance?: Map<string, { value: MaintenanceState; at: number }> };

export function forgetMaintenanceState(): void {
  g.__platformMaintenance = undefined;
  g.__companyMaintenance?.clear();
}

type Doc = { enabled?: boolean; message?: string; mode?: string; appliesTo?: string; startsAt?: Date; endsAt?: Date };
function fromDoc(doc: Doc | null | undefined): MaintenanceState {
  if (!doc) return MAINTENANCE_OFF;
  return {
    enabled: doc.enabled === true,
    message: typeof doc.message === "string" ? doc.message : "",
    mode: doc.mode === "banner" ? "banner" : "takeover",
    appliesTo: doc.appliesTo === "sites" || doc.appliesTo === "apps" ? doc.appliesTo : "both",
    startsAt: doc.startsAt ? new Date(doc.startsAt).getTime() : 0,
    endsAt: doc.endsAt ? new Date(doc.endsAt).getTime() : 0,
  };
}

/** The maintenance window set for ONE company (Platform Console → Companies → that company → Maintenance). */
export async function getCompanyMaintenance(companyId: string): Promise<MaintenanceState> {
  const cache = (g.__companyMaintenance ??= new Map());
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value = MAINTENANCE_OFF;
  try {
    const doc = await (await getPlatformDb()).collection<{ _id: string; maintenance?: Doc }>("companies").findOne({ _id: companyId }, { projection: { maintenance: 1 } });
    value = fromDoc(doc?.maintenance);
  } catch (err) {
    console.error("[maintenance] company read failed", err);
  }
  if (cache.size > 2000) cache.clear();
  cache.set(companyId, { value, at: Date.now() });
  return value;
}

/**
 * What applies to a company right now: its own window and the platform-wide one, whichever is more pressing — a window that is live beats
 * one that is only announced; between two of the same kind, the company's own wins (platform-wide next).
 */
export async function getEffectiveMaintenance(companyId: string | null | undefined): Promise<MaintenanceState> {
  const [platform, own] = await Promise.all([getMaintenanceState(), companyId ? getCompanyMaintenance(companyId) : Promise.resolve(MAINTENANCE_OFF)]);
  const rank = (m: MaintenanceState) => (maintenancePhase(m) === "active" ? 2 : maintenancePhase(m) === "upcoming" ? 1 : 0);
  return rank(own) >= rank(platform) ? (rank(own) > 0 ? own : platform) : platform;
}

export async function getMaintenanceState(): Promise<MaintenanceState> {
  const hit = g.__platformMaintenance;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value = MAINTENANCE_OFF;
  try {
    value = fromDoc(await (await getPlatformDb()).collection<{ _id: string } & Doc>("platform_settings").findOne({ _id: "maintenance" }));
  } catch (err) {
    console.error("[maintenance] read failed", err);
  }
  g.__platformMaintenance = { value, at: Date.now() };
  return value;
}
