/**
 * Platform-wide maintenance (Platform Console → Maintenance). Pure helpers, no server imports: used by the proxy, the root layout, the
 * Platform Console form and the countdown components.
 *
 * One window for every company: from `startsAt` to `endsAt`. Before it starts there is an announcement banner with a countdown to the
 * start; during it, either a banner ("banner") or the full maintenance screen instead of the site / products ("takeover"), with a
 * countdown to the end; after `endsAt` everything is back on its own, with nobody having to switch anything off.
 */

export type MaintenanceMode = "banner" | "takeover";
export type MaintenanceScope = "both" | "sites" | "apps";
export type MaintenancePhase = "off" | "upcoming" | "active";

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  mode: MaintenanceMode;
  appliesTo: MaintenanceScope;
  /** Epoch ms. */
  startsAt: number;
  endsAt: number;
}

export const MAINTENANCE_OFF: MaintenanceState = { enabled: false, message: "", mode: "takeover", appliesTo: "both", startsAt: 0, endsAt: 0 };
export const MAINTENANCE_MAX_HOURS = 72;
export const MAINTENANCE_MAX_MESSAGE = 280;

export function maintenancePhase(m: MaintenanceState, now: number = Date.now()): MaintenancePhase {
  if (!m.enabled || !m.endsAt || now >= m.endsAt) return "off";
  return now < m.startsAt ? "upcoming" : "active";
}

/** Does the window reach this kind of address — a company's website ("site") or its products ("app")? */
export function maintenanceReaches(m: MaintenanceState, surface: "site" | "app"): boolean {
  return m.appliesTo === "both" || (surface === "site" ? m.appliesTo === "sites" : m.appliesTo === "apps");
}

/** The full maintenance screen replaces the site / products (only while the window is open). */
export function isTakeoverNow(m: MaintenanceState, surface: "site" | "app", now: number = Date.now()): boolean {
  return maintenancePhase(m, now) === "active" && m.mode === "takeover" && maintenanceReaches(m, surface);
}

/** The banner shows: the announcement before the start, and the whole window in banner mode. */
export function isBannerNow(m: MaintenanceState, surface: "site" | "app", now: number = Date.now()): boolean {
  const phase = maintenancePhase(m, now);
  if (phase === "off" || !maintenanceReaches(m, surface)) return false;
  return phase === "upcoming" || m.mode === "banner";
}
