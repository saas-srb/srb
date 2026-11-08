import { createHmac } from "node:crypto";
import { classifyGraphError, MetaApiError, networkError, type GraphErrorBody } from "./errors";
import { META_DEFAULT_VERSION } from "./constants";

/**
 * The one place that talks to the Meta Graph API for ads. Features: pinned version, `appsecret_proof` on every call, token in the
 * Authorization header (never in a URL), `x-business-use-case-usage` / `x-ad-account-usage` / `x-app-usage` parsing, bounded retries with
 * exponential backoff and jitter for reads and for throttled writes, and no blind retry of a create that may have executed (those surface
 * `ambiguous` so the launcher can look the object up before creating it again). `fetch` and `sleep` are replaceable for tests.
 */

export interface MetaUsage {
  /** Highest percentage across the usage headers (0 when none were sent). */
  maxPct: number;
  /** Minutes Meta says to wait before calling again (from estimated_time_to_regain_access), 0 when none. */
  regainMinutes: number;
  tier: string | null;
  raw: Record<string, unknown>;
}

export interface MetaClientOptions {
  token: string;
  /** App secret of the Meta app: when given every call carries `appsecret_proof`. */
  appSecret?: string | null;
  version?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  rand?: () => number;
  /** Retries for reads and throttled writes. */
  maxRetries?: number;
  /** Longest single wait inside a request; a longer throttle is thrown as a rate_limit error with retryAfterMs. */
  maxWaitMs?: number;
  baseUrl?: string;
  onUsage?: (u: MetaUsage) => void;
}

export type Params = Record<string, unknown>;

export function appSecretProof(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function parseUsage(h: Headers): MetaUsage {
  const raw: Record<string, unknown> = {};
  let max = 0;
  let regain = 0;
  let tier: string | null = null;
  const take = (name: string) => {
    const v = h.get(name);
    if (!v) return null;
    try {
      const j = JSON.parse(v) as unknown;
      raw[name] = j;
      return j;
    } catch {
      return null;
    }
  };
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  const buc = take("x-business-use-case-usage") as Record<string, Array<Record<string, unknown>>> | null;
  if (buc && typeof buc === "object") {
    for (const entries of Object.values(buc)) {
      for (const e of Array.isArray(entries) ? entries : []) {
        max = Math.max(max, num(e.call_count), num(e.total_cputime), num(e.total_time));
        regain = Math.max(regain, num(e.estimated_time_to_regain_access));
        if (typeof e.ads_api_access_tier === "string") tier = e.ads_api_access_tier;
      }
    }
  }
  const acc = take("x-ad-account-usage") as Record<string, unknown> | null;
  if (acc) {
    max = Math.max(max, num(acc.acc_id_util_pct));
    if (typeof acc.ads_api_access_tier === "string") tier = acc.ads_api_access_tier;
  }
  const app = take("x-app-usage") as Record<string, unknown> | null;
  if (app) max = Math.max(max, num(app.call_count), num(app.total_cputime), num(app.total_time));
  const ins = take("x-fb-ads-insights-throttle") as Record<string, unknown> | null;
  if (ins) max = Math.max(max, num(ins.app_id_util_pct), num(ins.acc_id_util_pct));
  return { maxPct: max, regainMinutes: regain, tier, raw };
}

/** Meta takes form fields; objects/arrays are JSON strings. */
export function encodeForm(params: Params): URLSearchParams {
  const f = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    f.set(k, typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return f;
}

export class MetaClient {
  readonly version: string;
  lastUsage: MetaUsage | null = null;
  calls = 0;
  private readonly o: Required<Pick<MetaClientOptions, "maxRetries" | "maxWaitMs">> & MetaClientOptions;

  constructor(opts: MetaClientOptions) {
    this.version = opts.version || process.env.META_ADS_GRAPH_VERSION || META_DEFAULT_VERSION;
    this.o = { ...opts, maxRetries: opts.maxRetries ?? 3, maxWaitMs: opts.maxWaitMs ?? 20_000 };
  }

  private url(path: string, query?: Params): string {
    const base = this.o.baseUrl ?? "https://graph.facebook.com";
    const p = path.startsWith("http") ? path : `${base}/${this.version}/${path.replace(/^\//, "")}`;
    const q = encodeForm({ ...(query ?? {}), ...(this.o.appSecret && !path.includes("appsecret_proof=") ? { appsecret_proof: appSecretProof(this.o.token, this.o.appSecret) } : {}) });
    const qs = q.toString();
    return qs ? `${p}${p.includes("?") ? "&" : "?"}${qs}` : p;
  }

  private async once<T>(method: "GET" | "POST" | "DELETE", path: string, query: Params | undefined, body: Params | FormData | undefined): Promise<T> {
    const f = this.o.fetchImpl ?? fetch;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.o.token}` };
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      payload = encodeForm(body);
    }
    this.calls++;
    let res: Response;
    try {
      res = await f(this.url(path, query), { method, headers, body: payload, signal: AbortSignal.timeout(method === "GET" ? 30_000 : 120_000) });
    } catch (e) {
      throw networkError(e instanceof Error && e.name === "TimeoutError");
    }
    const usage = parseUsage(res.headers);
    this.lastUsage = usage;
    this.o.onUsage?.(usage);
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok || (json && typeof json === "object" && "error" in (json as object) && !Array.isArray(json))) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Math.max(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0, usage.regainMinutes * 60_000) || null;
      throw classifyGraphError((json as { error?: GraphErrorBody } | null)?.error ?? null, res.status || 500, wait);
    }
    return json as T;
  }

  /**
   * `idempotentWrite: false` (default for POST/DELETE) never retries an ambiguous outcome (network error / 5xx): the caller must look the
   * object up. Throttled requests were rejected before running, so they are retried for every method.
   */
  async request<T = unknown>(method: "GET" | "POST" | "DELETE", path: string, opts: { query?: Params; body?: Params | FormData; idempotentWrite?: boolean } = {}): Promise<T> {
    const sleep = this.o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const rand = this.o.rand ?? Math.random;
    for (let n = 0; ; n++) {
      try {
        return await this.once<T>(method, path, opts.query, opts.body);
      } catch (e) {
        if (!(e instanceof MetaApiError) || !e.retryable || n >= this.o.maxRetries) throw e;
        if (e.ambiguous && method !== "GET" && !opts.idempotentWrite) throw e;
        const exp = Math.min(30_000, 1000 * 2 ** n);
        const wait = Math.max(Math.round(exp / 2 + rand() * (exp / 2)), e.retryAfterMs ?? 0);
        if (wait > this.o.maxWaitMs) throw e;
        await sleep(wait);
      }
    }
  }

  get<T = unknown>(path: string, query?: Params) {
    return this.request<T>("GET", path, { query });
  }
  post<T = unknown>(path: string, body: Params, opts: { idempotentWrite?: boolean; query?: Params } = {}) {
    return this.request<T>("POST", path, { body, ...opts });
  }
  del<T = unknown>(path: string) {
    return this.request<T>("DELETE", path, { idempotentWrite: true });
  }

  /** Follows `paging.next` up to `maxPages`. */
  async getAll<T>(path: string, query: Params = {}, maxPages = 10): Promise<T[]> {
    const out: T[] = [];
    let next: string | null = null;
    for (let i = 0; i < maxPages; i++) {
      const page: { data?: T[]; paging?: { next?: string; cursors?: { after?: string } } } = next ? await this.request("GET", next) : await this.get(path, { limit: 100, ...query });
      out.push(...(page.data ?? []));
      next = page.paging?.next ?? null;
      if (!next) break;
    }
    return out;
  }
}
