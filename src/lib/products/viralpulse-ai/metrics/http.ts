import type { ErrorKind } from "./types";

/**
 * One small HTTP layer for every puller. `fetch` and `sleep` come in as parameters so the tests run against a fake server and never
 * reach the internet. Errors are classified once here (auth / permission / rate limit / quota / not found / transient) so pullers and the
 * scheduler can react the same way for every platform. Messages never contain the request URL (it carries tokens).
 */

export class MetricsApiError extends Error {
  constructor(message: string, readonly kind: ErrorKind, readonly status: number, readonly code: string | null = null, readonly retryAfterMs: number | null = null) {
    super(message);
    this.name = "MetricsApiError";
  }
}

export interface MetricsHttp {
  getJson<T = unknown>(url: string, headers?: Record<string, string>): Promise<T>;
  /** Requests made so far (for the run summary and rate-limit budgeting). */
  calls: number;
}

export interface HttpDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  rand?: () => number;
}

const MAX_TRANSIENT_RETRIES = 2;
const redact = (s: string) => s.replace(/(access_token|client_secret|refresh_token|code|token|key)=[^&\s"']+/gi, "$1=[redacted]").replace(/Bearer\s+[\w.~+/-]+=*/gi, "Bearer [redacted]").slice(0, 300);

/** Seconds until the next midnight Pacific time: Google resets the YouTube quota then. */
export function msUntilPacificMidnight(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }).formatToParts(now);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsed = g("hour") * 3600 + g("minute") * 60 + g("second");
  return Math.max(60, 86400 - elapsed) * 1000;
}

function retryAfter(h: Headers, now: Date): number | null {
  const ra = h.get("retry-after");
  if (ra) {
    const n = Number(ra);
    if (Number.isFinite(n)) return Math.round(n * 1000);
    const t = Date.parse(ra);
    if (!Number.isNaN(t)) return Math.max(0, t - now.getTime());
  }
  // X: x-rate-limit-reset is epoch seconds.
  const reset = h.get("x-rate-limit-reset");
  if (reset && Number.isFinite(Number(reset))) return Math.max(0, Number(reset) * 1000 - now.getTime());
  return null;
}

/** Meta says how much of the app's hourly allowance is used in `x-app-usage` / `x-business-use-case-usage`. */
export function metaUsagePct(h: Headers): number {
  let max = 0;
  const app = h.get("x-app-usage");
  try {
    if (app) {
      const j = JSON.parse(app) as Record<string, number>;
      for (const k of ["call_count", "total_cputime", "total_time"]) max = Math.max(max, Number(j[k]) || 0);
    }
    const buc = h.get("x-business-use-case-usage");
    if (buc) {
      const j = JSON.parse(buc) as Record<string, { call_count?: number; total_cputime?: number; total_time?: number }[]>;
      for (const arr of Object.values(j)) for (const e of arr) max = Math.max(max, e.call_count ?? 0, e.total_cputime ?? 0, e.total_time ?? 0);
    }
  } catch {
    /* header is advisory */
  }
  return max;
}

export function classify(status: number, body: unknown, headers: Headers, now: Date): MetricsApiError {
  const b = (body ?? {}) as { error?: { message?: string; code?: number | string; error_subcode?: number; status?: string; errors?: { reason?: string; message?: string }[]; type?: string } | string; message?: string; detail?: string; title?: string; errors?: { message?: string }[] };
  const obj = typeof b.error === "object" && b.error ? b.error : null;
  const code = obj?.code !== undefined ? String(obj.code) : null;
  const reason = obj?.errors?.[0]?.reason ?? null;
  const msg = redact(String(obj?.message ?? (typeof b.error === "string" ? b.error : "") ?? b.message ?? b.detail ?? b.title ?? `HTTP ${status}`) || `HTTP ${status}`);
  const ra = retryAfter(headers, now);
  // Meta Graph: 190 = token invalid; 4/17/32/613/80000-80014 = call limits; 10 and 200-299 = permission; 100 = bad parameter (e.g. a metric that no longer exists).
  const n = Number(code);
  if (status === 401 || code === "190") return new MetricsApiError(msg, "auth", 401, code ?? "190");
  if (code && [4, 17, 32, 613].includes(n)) return new MetricsApiError(msg, "rate_limit", status, code, ra ?? 30 * 60_000);
  if (code && n >= 80000 && n <= 80014) return new MetricsApiError(msg, "rate_limit", status, code, ra ?? 30 * 60_000);
  if (reason && ["quotaExceeded", "dailyLimitExceeded", "userRateLimitExceeded", "rateLimitExceeded"].includes(reason)) {
    return reason === "quotaExceeded" || reason === "dailyLimitExceeded" ? new MetricsApiError(msg, "quota", status, reason, msUntilPacificMidnight(now)) : new MetricsApiError(msg, "rate_limit", status, reason, ra ?? 10 * 60_000);
  }
  if (status === 429) return new MetricsApiError(msg, "rate_limit", 429, code, ra ?? 15 * 60_000);
  if (status === 402) return new MetricsApiError(msg, "quota", 402, code, ra ?? 6 * 3_600_000);
  if (status === 403 || code === "10" || (n >= 200 && n <= 299)) return new MetricsApiError(msg, "scope", status || 403, code ?? reason);
  if (status === 404) return new MetricsApiError(msg, "not_found", 404, code);
  if (status === 400) return new MetricsApiError(msg, "bad_request", 400, code);
  if (status >= 500 || status === 0) return new MetricsApiError(msg, "transient", status, code, ra);
  return new MetricsApiError(msg, "bad_request", status, code);
}

export function makeHttp(d: HttpDeps): MetricsHttp {
  const rand = d.rand ?? Math.random;
  const http: MetricsHttp = {
    calls: 0,
    async getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
      let lastErr: MetricsApiError | null = null;
      for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
        http.calls++;
        let res: Response;
        try {
          res = await d.fetch(url, { method: "GET", headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(30_000) });
        } catch {
          lastErr = new MetricsApiError("Could not reach the platform.", "transient", 0);
          if (attempt < MAX_TRANSIENT_RETRIES) await d.sleep(Math.round((1000 * 2 ** attempt) * (0.5 + rand() / 2)));
          continue;
        }
        const text = await res.text();
        let body: unknown = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = { message: text.slice(0, 200) };
        }
        if (res.ok) {
          // Meta signals "slow down" in headers before it starts refusing: past 90% of the allowance we stop for the run.
          if (metaUsagePct(res.headers) >= 90) throw new MetricsApiError("Meta reports this app is close to its hourly call limit.", "rate_limit", 200, "usage", 30 * 60_000);
          return body as T;
        }
        const err = classify(res.status, body, res.headers, d.now());
        if (err.kind !== "transient") throw err;
        lastErr = err;
        if (attempt < MAX_TRANSIENT_RETRIES) await d.sleep(Math.max(err.retryAfterMs ?? 0, Math.round(1000 * 2 ** attempt * (0.5 + rand() / 2))));
      }
      throw lastErr ?? new MetricsApiError("The platform did not answer.", "transient", 0);
    },
  };
  return http;
}
