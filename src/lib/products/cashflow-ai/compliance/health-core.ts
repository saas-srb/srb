export type HealthLevel = "ok" | "warn" | "bad" | "unknown";

export interface HealthCheck {
  key: string;
  label: string;
  level: HealthLevel;
  detail: string;
  href?: string;
}

/** Overall verdict: the worst level wins; "unknown" ranks above ok so an unchecked item is never read as fine. */
export function overallLevel(checks: HealthCheck[]): HealthLevel {
  if (checks.some((c) => c.level === "bad")) return "bad";
  if (checks.some((c) => c.level === "warn")) return "warn";
  if (checks.some((c) => c.level === "unknown")) return "unknown";
  return "ok";
}
