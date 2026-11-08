/** Client-safe: what an incident on the status page is made of. */
export const INCIDENT_STATUSES = [
  { key: "investigating", label: "Investigating" },
  { key: "identified", label: "Identified" },
  { key: "monitoring", label: "Monitoring" },
  { key: "resolved", label: "Resolved" },
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number]["key"];

/** `outage` and `major` count as downtime in the uptime figure; `degraded` and `maintenance` do not. */
export const INCIDENT_IMPACTS = [
  { key: "degraded", label: "Degraded performance", downtime: false },
  { key: "major", label: "Major problem (part of the product down)", downtime: true },
  { key: "outage", label: "Full outage", downtime: true },
  { key: "maintenance", label: "Planned maintenance", downtime: false },
] as const;
export type IncidentImpact = (typeof INCIDENT_IMPACTS)[number]["key"];

export const INCIDENT_COMPONENTS = ["Website and apps", "Database", "Sign-in", "Payments", "Email and notifications", "AI features"] as const;

export interface IncidentUpdate {
  at: string;
  status: IncidentStatus;
  message: string;
}

export interface IncidentView {
  id: string;
  title: string;
  impact: IncidentImpact;
  status: IncidentStatus;
  components: string[];
  startedAt: string;
  resolvedAt: string | null;
  updates: IncidentUpdate[];
}

export const isDowntime = (impact: IncidentImpact) => INCIDENT_IMPACTS.find((i) => i.key === impact)?.downtime === true;

/**
 * Uptime over the last `days` days from recorded incidents: the minutes covered by `outage` / `major` incidents (merged where they overlap,
 * clipped to the window, an unresolved one counted up to `now`) against all minutes in the window. It is only as complete as the incident record.
 */
export function uptimePercent(incidents: Pick<IncidentView, "impact" | "startedAt" | "resolvedAt">[], days: number, now = Date.now()): number {
  const from = now - days * 86_400_000;
  const spans = incidents
    .filter((i) => isDowntime(i.impact))
    .map((i) => [Math.max(from, Date.parse(i.startedAt)), Math.min(now, i.resolvedAt ? Date.parse(i.resolvedAt) : now)] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let down = 0;
  let end = from;
  for (const [a, b] of spans) {
    const start = Math.max(a, end);
    if (b > start) {
      down += b - start;
      end = b;
    }
  }
  return Math.round((1 - down / (now - from)) * 100_000) / 1000; // 3 decimals
}

export function formatDuration(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} d ${h % 24} h`;
}
