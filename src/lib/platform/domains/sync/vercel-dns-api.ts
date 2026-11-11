import { promises as dns } from "node:dns";
import type { VercelConfig } from "@/lib/platform/domains/vercel";
import { classifyDnsAuthority, planDnsCopy, type DnsAuthorityResult, type DnsRecordRow } from "@/lib/platform/domains/sync/dns";
import { createRequester, type ApiOptions } from "@/lib/platform/domains/sync/vercel-api";

/** Vercel DNS reads/writes for the root domain: where its zone lives, and copying records from another account's zone. Never deletes anything. */

export async function detectDnsAuthority(cfg: VercelConfig, root: string, opts: ApiOptions & { resolveNs?: (d: string) => Promise<string[]> } = {}): Promise<DnsAuthorityResult> {
  const request = createRequester(cfg, opts);
  let inThisTeam: { serviceType: string } | null = null;
  let nameservers: string[] | null = null;
  const dom = await request<{ domain?: { serviceType?: string; nameservers?: string[] } }>("GET", `/v5/domains/${encodeURIComponent(root)}`).catch(() => null);
  if (dom?.status === 200 && dom.data.domain) {
    inThisTeam = { serviceType: dom.data.domain.serviceType ?? "unknown" };
    nameservers = dom.data.domain.nameservers ?? null;
  }
  if (!nameservers?.length) {
    const live = await (opts.resolveNs ?? ((d) => dns.resolveNs(d))) (root).catch(() => [] as string[]);
    if (live.length) nameservers = live;
  }
  return classifyDnsAuthority({ root, inThisTeam, nameservers });
}

async function listAll(cfg: VercelConfig, root: string, opts: ApiOptions): Promise<DnsRecordRow[]> {
  const request = createRequester(cfg, opts);
  const out: DnsRecordRow[] = [];
  let until: string | null = null;
  for (let i = 0; i < 200; i++) {
    const res: { status: number; data: { records?: DnsRecordRow[]; pagination?: { next?: number | string | null } } } = await request("GET", `/v4/domains/${encodeURIComponent(root)}/records`, { limit: "100", ...(until ? { until } : {}) });
    if (res.status !== 200) throw new Error(`Vercel ${res.status}: couldn't read the DNS records of ${root}`);
    out.push(...(res.data.records ?? []));
    const next = res.data.pagination?.next;
    if (next === null || next === undefined) break;
    until = String(next);
  }
  return out;
}

export interface DnsCopyReport {
  dryRun: boolean;
  source: number;
  wouldCreate: number;
  created: number;
  skipped: number;
  failed: { name: string; type: string; error: string }[];
}

/** Reads the zone with the OLD account's token and creates the missing records in THIS account's zone. Dry run reports only. */
export async function copyDnsRecords(input: { from: VercelConfig; to: VercelConfig; root: string; dryRun: boolean }, opts: ApiOptions = {}): Promise<DnsCopyReport> {
  const source = await listAll(input.from, input.root, opts);
  const request = createRequester(input.to, opts);
  // The domain must exist in this account; adding it is idempotent (409 = already there).
  if (!input.dryRun) await request("POST", "/v7/domains", {}, { name: input.root }).catch(() => null);
  const existing = await listAll(input.to, input.root, opts).catch(() => [] as DnsRecordRow[]);
  const plan = planDnsCopy(source, existing);
  const report: DnsCopyReport = { dryRun: input.dryRun, source: source.length, wouldCreate: plan.create.length, created: 0, skipped: plan.skipped.length, failed: [] };
  if (input.dryRun) return report;
  for (const r of plan.create) {
    const body: Record<string, unknown> = { name: r.name === "@" ? "" : r.name, type: r.type, value: r.value, ...(r.ttl ? { ttl: r.ttl } : {}), ...(r.mxPriority !== undefined ? { mxPriority: r.mxPriority } : {}) };
    const res = await request<{ error?: { message?: string } }>("POST", `/v2/domains/${encodeURIComponent(input.root)}/records`, {}, body).catch((e) => ({ status: 0, data: { error: { message: String(e) } } }));
    if (res.status === 200) report.created++;
    else report.failed.push({ name: r.name, type: r.type, error: `Vercel ${res.status}: ${(res.data as { error?: { message?: string } }).error?.message ?? "failed"}` });
  }
  return report;
}
