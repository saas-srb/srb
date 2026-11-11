import { routingRecord, type VercelConfig } from "@/lib/platform/domains/vercel";
import type { DnsRecord, DomainStatus } from "@/lib/platform/domains/types";
import { retryAfterFromHeaders, withBackoff } from "@/lib/platform/domains/sync/retry";
import type { AddResult, ApiResult, VercelDomainsApi } from "@/lib/platform/domains/sync/types";

/**
 * The real Vercel adapter for Domain sync, bound to one project. Every call backs off on 429/5xx (honouring Vercel's own
 * retry hints). `fetchFn` and `sleep` are injectable so the tests never touch the network or wait.
 */

const API = (process.env.VERCEL_API_URL?.trim() || "https://api.vercel.com").replace(/\/+$/, "");

interface VErr {
  error?: { code?: string; message?: string; projectId?: string; verification?: Verification[] };
  verification?: Verification[];
}
interface Verification {
  type: string;
  domain: string;
  value: string;
  reason?: string;
}
interface ProjectDomain extends VErr {
  name?: string;
  verified?: boolean;
}

export interface ApiOptions {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const toRecords = (v: Verification[] | undefined): DnsRecord[] =>
  (v ?? []).map((x) => ({ type: x.type.toUpperCase() as DnsRecord["type"], name: x.domain, value: x.value, reason: x.reason || "Proves you own the domain" }));

export type Requester = <T>(method: string, path: string, query?: Record<string, string>, body?: unknown) => Promise<{ status: number; data: T; retryAfterMs: number | null }>;

/** One authenticated Vercel REST caller (team id added, backing off on 429/5xx). */
export function createRequester(cfg: VercelConfig, opts: ApiOptions = {}): Requester {
  const fetchFn = opts.fetchFn ?? fetch;
  const now = opts.now ?? Date.now;
  return async function request<T>(method: string, path: string, query: Record<string, string> = {}, body?: unknown) {
    return withBackoff(async () => {
      const url = new URL(API + path);
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
      if (cfg.team) url.searchParams.set("teamId", cfg.team);
      const res = await fetchFn(url, {
        method,
        headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await res.json().catch(() => ({}))) as T;
      return { status: res.status, data, retryAfterMs: retryAfterFromHeaders((n) => res.headers.get(n), now()) };
    }, opts.sleep);
  };
}

export function createVercelDomainsApi(cfg: VercelConfig, opts: ApiOptions = {}): VercelDomainsApi {
  const request = createRequester(cfg, opts);

  const project = encodeURIComponent(cfg.project);
  const fail = (status: number, data: VErr): { ok: false; error: string } => ({ ok: false, error: `Vercel ${status}: ${data.error?.message ?? data.error?.code ?? "request failed"}` });

  async function statusOf(host: string, d: ProjectDomain): Promise<DomainStatus> {
    const cfgRes = await request<{ misconfigured?: boolean }>("GET", `/v6/domains/${encodeURIComponent(host)}/config`).catch(() => null);
    const configured = cfgRes?.status === 200 && cfgRes.data.misconfigured === false;
    return { attached: true, verified: Boolean(d.verified), dnsConfigured: configured, records: [...toRecords(d.verification), ...(configured ? [] : [routingRecord(host)])] };
  }

  return {
    async listDomains(cursor) {
      const { status, data } = await request<{ domains?: { name: string; verified?: boolean }[]; pagination?: { next?: number | null } } & VErr>("GET", `/v9/projects/${project}/domains`, { limit: "100", ...(cursor ? { until: cursor } : {}) });
      if (status !== 200) return fail(status, data);
      const next = data.pagination?.next;
      return { ok: true, value: { names: (data.domains ?? []).map((d) => d.name), unverified: (data.domains ?? []).filter((d) => d.verified === false).map((d) => d.name), next: next === null || next === undefined ? null : String(next) } };
    },

    async addDomain(host, options): Promise<AddResult> {
      const { status, data } = await request<ProjectDomain>("POST", `/v10/projects/${project}/domains`, {}, { name: host, ...(options?.redirectTo ? { redirect: options.redirectTo, redirectStatusCode: 308 } : {}) });
      if (status === 200) return { ok: true, value: await statusOf(host, data) };
      if (status === 409) {
        // Already on THIS project (a retried run): report its state. Otherwise another project or account holds it.
        if (data.error?.projectId === cfg.project) {
          const st = await this.domainStatus(host);
          if (st.ok && st.value) return { ok: true, value: st.value };
        }
        return { ok: false, error: `Vercel 409: ${data.error?.message ?? "domain already in use"}`, ownedElsewhere: { records: toRecords(data.error?.verification ?? data.verification) } };
      }
      return fail(status, data);
    },

    async domainStatus(host): Promise<ApiResult<DomainStatus | null>> {
      const { status, data } = await request<ProjectDomain>("GET", `/v9/projects/${project}/domains/${encodeURIComponent(host)}`);
      if (status === 404) return { ok: true, value: null };
      if (status !== 200) return fail(status, data);
      return { ok: true, value: await statusOf(host, data) };
    },

    async removeDomain(host) {
      const { status, data } = await request<VErr>("DELETE", `/v9/projects/${project}/domains/${encodeURIComponent(host)}`);
      if (status === 200 || status === 404) return { ok: true, value: null };
      return fail(status, data);
    },
  };
}
