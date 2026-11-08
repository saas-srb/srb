import type { DnsRecord, DomainProvider, DomainResult, DomainStatus } from "@/lib/platform/domains/types";

/**
 * Vercel project domains (REST API). Attaching a host to the project is what
 * makes Vercel route it here and issue its TLS certificate automatically.
 * Needs an API token + project id (and a team id for a team-owned project),
 * resolved server-side by `integrations/` (Platform Console → Integrations,
 * else `VERCEL_API_TOKEN` / `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID`).
 */

const API = (process.env.VERCEL_API_URL?.trim() || "https://api.vercel.com").replace(/\/+$/, "");

export interface VercelConfig {
  token: string;
  project: string;
  team: string | null;
}

/** The environment-only configuration (used when nothing is saved in the Platform Console). */
export function vercelEnvConfig(): VercelConfig | null {
  const token = process.env.VERCEL_API_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project) return null;
  return { token, project, team: process.env.VERCEL_TEAM_ID || null };
}

type ApiResponse<T> = { status: number; data: T & { error?: { code?: string; message?: string } } };

async function call<T>(cfg: VercelConfig | null, method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  if (!cfg) throw new Error("The Vercel API token / project id are not configured");
  const url = new URL(API + path.replace(":project", encodeURIComponent(cfg.project)));
  if (cfg.team) url.searchParams.set("teamId", cfg.team);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { code?: string; message?: string } };
  return { status: res.status, data };
}

interface ProjectDomain {
  name: string;
  verified: boolean;
  verification?: { type: string; domain: string; value: string; reason: string }[];
}

/** DNS the owner must publish so traffic reaches Vercel: apex → A record, subdomain → CNAME. */
export function routingRecord(host: string): DnsRecord {
  const labels = host.split(".");
  return labels.length <= 2
    ? { type: "A", name: "@", value: "76.76.21.21", reason: "Points the domain at the hosting platform" }
    : { type: "CNAME", name: labels.slice(0, -2).join("."), value: "cname.vercel-dns.com", reason: "Points the domain at the hosting platform" };
}

async function dnsConfigured(cfg: VercelConfig | null, host: string): Promise<boolean> {
  const { status, data } = await call<{ misconfigured?: boolean }>(cfg, "GET", `/v6/domains/${encodeURIComponent(host)}/config`);
  return status === 200 && data.misconfigured === false;
}

async function toStatus(cfg: VercelConfig | null, host: string, d: ProjectDomain): Promise<DomainStatus> {
  const configured = await dnsConfigured(cfg, host).catch(() => false);
  const records: DnsRecord[] = [
    ...(d.verification ?? []).map((v) => ({ type: v.type.toUpperCase() as DnsRecord["type"], name: v.domain, value: v.value, reason: v.reason || "Proves you own the domain" })),
    ...(configured ? [] : [routingRecord(host)]),
  ];
  return { attached: true, verified: d.verified, dnsConfigured: configured, records };
}

function failure(status: number, data: { error?: { code?: string; message?: string } }): { ok: false; error: string } {
  return { ok: false, error: `Vercel ${status}: ${data.error?.message ?? data.error?.code ?? "request failed"}` };
}

/** A Vercel adapter bound to one configuration (null = not configured: every call reports that). */
export function createVercelDomainProvider(cfg: VercelConfig | null): DomainProvider {
  const provider: DomainProvider = {
    id: "vercel",

    async add(host) {
      const { status, data } = await call<ProjectDomain>(cfg, "POST", "/v10/projects/:project/domains", { name: host });
      if (status === 200) return { ok: true, value: await toStatus(cfg, host, data) };
      // Already on this project (e.g. a retried provisioning) — report its current state.
      if (status === 409 && data.error?.code === "domain_already_in_use") {
        const existing = await provider.status(host);
        if (existing.ok) return existing;
      }
      return failure(status, data);
    },

    async status(host): Promise<DomainResult<DomainStatus>> {
      const { status, data } = await call<ProjectDomain>(cfg, "GET", `/v9/projects/:project/domains/${encodeURIComponent(host)}`);
      if (status === 404) return { ok: true, value: { attached: false, verified: false, dnsConfigured: false, records: [] } };
      if (status !== 200) return failure(status, data);
      return { ok: true, value: await toStatus(cfg, host, data) };
    },

    async verify(host) {
      const { status, data } = await call<ProjectDomain>(cfg, "POST", `/v9/projects/:project/domains/${encodeURIComponent(host)}/verify`);
      // 400 = still not verifiable; fall back to reporting the current state and outstanding records.
      if (status === 200) return { ok: true, value: await toStatus(cfg, host, data) };
      const current = await provider.status(host);
      return current.ok ? current : failure(status, data);
    },

    async remove(host) {
      const { status, data } = await call(cfg, "DELETE", `/v9/projects/:project/domains/${encodeURIComponent(host)}`);
      if (status === 200 || status === 404) return { ok: true, value: null };
      return failure(status, data);
    },
  };
  return provider;
}

/**
 * Read-only credential check for Platform Console → Integrations: reads the
 * project (never changes anything). Reports what went wrong in plain words.
 */
export async function checkVercelAccess(cfg: VercelConfig): Promise<{ ok: true; projectName: string } | { ok: false; error: string }> {
  try {
    const { status, data } = await call<{ name?: string }>(cfg, "GET", "/v9/projects/:project");
    if (status === 200) return { ok: true, projectName: data.name ?? cfg.project };
    if (status === 401 || status === 403) return { ok: false, error: `Vercel ${status}: the token was rejected or can't access this project${cfg.team ? "" : " (a team-owned project also needs the team id)"}.` };
    if (status === 404) return { ok: false, error: "Vercel 404: no project with that id is visible to this token." };
    return failure(status, data);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
