import { MetricsApiError, type MetricsHttp } from "../http";
import type { AccountSyncState, MetricRow, MetricsSettings, Target } from "../types";

export interface PullAccount {
  id: string;
  externalId: string;
  name: string;
  provider: string;
  meta: Record<string, string>;
  scopes: string[];
}

export interface PullCtx {
  token: string;
  account: PullAccount;
  http: MetricsHttp;
  now: Date;
  /** Published posts that belong to this account, matched by the platform's own id. */
  targets: Target[];
  state: Pick<AccountSyncState, "cursor" | "quota">;
  settings: MetricsSettings;
  /** Ignore "already read today" cursors (first connect, or a manual full read). */
  full: boolean;
  linkedinVersion?: string;
}

export interface PullOutput {
  rows: MetricRow[];
  cursor: Partial<AccountSyncState["cursor"]>;
  /** Replaces the stored quota counters. */
  quota?: Partial<AccountSyncState["quota"]>;
  /** Things that were unavailable (permission, platform limit) without stopping the run. */
  warnings: string[];
  /** How many targets were read, and how many were left for the next run (quota / cap). */
  read: number;
  deferred: number;
}

export const ymd = (d: Date): string => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000);
export const startOfUtcDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const unix = (d: Date): number => Math.floor(d.getTime() / 1000);
export const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
export const chunk = <T>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

/** Days from `from` to `to` inclusive as YYYY-MM-DD. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * Runs one optional part of a pull. "I may not read this" (missing permission, a metric the platform retired, an unsupported account type)
 * becomes a warning shown on the account; running out of rate limit / quota / login stops the whole run, so those are rethrown.
 */
export async function section<T>(warnings: string[], name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof MetricsApiError && ["scope", "not_found", "bad_request", "platform_limit"].includes(e.kind)) {
      warnings.push(`${name}: ${e.kind === "scope" ? "not allowed. " : ""}${e.message}`.slice(0, 280));
      return undefined;
    }
    throw e;
  }
}

/**
 * Asks for several metrics in one call; if the platform rejects the call because ONE of them is unknown or unavailable for this
 * account (a 400), asks again per metric so the others still arrive. Returns the metrics that worked and the ones that did not.
 */
export async function tolerant<T>(metrics: string[], call: (metrics: string[]) => Promise<T[]>): Promise<{ data: T[]; failed: { metric: string; message: string }[] }> {
  try {
    return { data: await call(metrics), failed: [] };
  } catch (e) {
    if (!(e instanceof MetricsApiError) || e.kind !== "bad_request" || metrics.length === 1) {
      if (e instanceof MetricsApiError && e.kind === "bad_request" && metrics.length === 1) return { data: [], failed: [{ metric: metrics[0], message: e.message }] };
      throw e;
    }
  }
  const data: T[] = [];
  const failed: { metric: string; message: string }[] = [];
  for (const m of metrics) {
    try {
      data.push(...(await call([m])));
    } catch (e) {
      if (e instanceof MetricsApiError && (e.kind === "bad_request" || e.kind === "not_found")) failed.push({ metric: m, message: e.message });
      else throw e;
    }
  }
  return { data, failed };
}
