import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { APP_SLUG_SUFFIX, COMPANIES_COLLECTION, COMPANY_DOMAINS_COLLECTION, isPlatformHost, type Company, type CompanyDomain } from "@/lib/platform/tenancy/companies";
import { buildTargets } from "@/lib/platform/domains/sync/engine";
import type { HostWrite, SyncCounts, SyncEvent, SyncStore } from "@/lib/platform/domains/sync/types";

/** Database side of Domain sync: the company/host reader and writer the engine uses, plus the run and event collections. */

export const SYNC_RUNS = "domain_sync_runs";
export const SYNC_EVENTS = "domain_sync_events";
export const PLATFORM_HOSTS = "platform_hosts_state";
const EVENT_DAYS = 60;

export interface SyncRun {
  _id: string;
  status: "running" | "done" | "failed";
  dryRun: boolean;
  trigger: "manual" | "cron" | "config" | "boot";
  by: string | null;
  startedAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  /** Last fully processed company id: the run continues after it. */
  cursor: string | null;
  companiesTotal: number;
  counts: SyncCounts;
  releaseFromOld: boolean;
  projectId: string;
  error: string | null;
}

export async function runs() {
  return (await getPlatformDb()).collection<SyncRun>(SYNC_RUNS);
}

let indexed = false;
async function events() {
  const c = (await getPlatformDb()).collection<SyncEvent & { runId: string; at: Date; dryRun: boolean; expiresAt: Date }>(SYNC_EVENTS);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ runId: 1, at: -1 }).catch(() => {}), c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {})]);
  }
  return c;
}

export async function recentEvents(runId: string, limit = 200) {
  return (await events()).find({ runId }, { projection: { _id: 0, runId: 0, expiresAt: 0 } }).sort({ at: -1 }).limit(limit).toArray();
}

/** The engine's database adapter for one run. */
export function createMongoSyncStore(runId: string, dryRun: boolean, root: string): SyncStore {
  return {
    async loadBatch(cursor, size) {
      const db = await getPlatformDb();
      const companies = await db
        .collection<Company>(COMPANIES_COLLECTION)
        .find(cursor ? { _id: { $gt: cursor } } : {}, { projection: { _id: 1, slug: 1 } })
        .sort({ _id: 1 })
        .limit(size)
        .toArray();
      if (!companies.length) return { companies: [], next: null };
      const docs = await db
        .collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION)
        .find({ companyId: { $in: companies.map((c) => c._id) } }, { projection: { _id: 1, companyId: 1, kind: 1, provider: 1, appProvider: 1 } })
        .toArray();
      const out = companies.map((c) => ({
        companyId: c._id,
        targets: buildTargets(c, docs.filter((d) => d.companyId === c._id), { root, appSuffix: APP_SLUG_SUFFIX, isPlatformHost }),
      }));
      return { companies: out, next: companies.length < size ? null : companies[companies.length - 1]._id };
    },

    async saveHost(target, w: HostWrite) {
      if (target.kind === "platform") {
        await (await getPlatformDb()).collection<{ _id: string }>(PLATFORM_HOSTS).updateOne({ _id: target.host }, { $set: { role: target.role ?? null, redirectTo: target.redirectTo ?? null, attached: w.attached, verified: w.verified, dnsConfigured: w.dnsConfigured, error: w.error, records: w.records, syncStatus: w.syncStatus, checkedAt: new Date() } }, { upsert: true });
        return;
      }
      if (!target.docId) return; // no record to hold it (the automatic address is routed by slug alone)
      const col = (await getPlatformDb()).collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION);
      const challenged = Boolean(target.stored?.challenged) || (!w.verified && w.records.some((r) => r.type === "TXT"));
      await col.updateOne(
        { _id: target.docId },
        { $set: { [target.field]: { id: "vercel", attached: w.attached, verified: w.verified, dnsConfigured: w.dnsConfigured, error: w.error, checkedAt: new Date(), records: w.records, challenged, syncStatus: w.syncStatus } } },
      );
      for (const r of w.records) {
        await col.updateOne(
          { _id: target.docId, dnsLog: { $not: { $elemMatch: { type: r.type, name: r.name, value: r.value } } } },
          { $push: { dnsLog: { host: target.host, type: r.type, name: r.name, value: r.value, reason: r.reason, seenAt: new Date() } } },
        );
      }
    },

    async event(e) {
      await (await events()).insertOne({ ...e, runId, at: new Date(), dryRun, expiresAt: new Date(Date.now() + EVENT_DAYS * 86_400_000) });
    },
  };
}

// ── Summary for the Console ──────────────────────────────────────────────────

export interface HostSummary {
  totalHosts: number;
  attached: number;
  verified: number;
  sslActive: number;
  needsDns: number;
  ownedElsewhere: number;
  failed: number;
}

export interface HostProblem {
  host: string;
  companyId: string;
  companyName: string;
  kind: "owned_elsewhere" | "failed";
  reason: string;
  records: { type: string; name: string; value: string }[];
  checkedAt: string | null;
}

const PAGE = 2000;

/** Counts and the problem list, from what is stored on `company_domains` (reads only). The app host of every automatic address counts as a host too. */
export async function summarizeHosts(problemLimit = 500): Promise<{ summary: HostSummary; problems: HostProblem[] }> {
  const db = await getPlatformDb();
  const names = new Map((await db.collection<Company>(COMPANIES_COLLECTION).find({}, { projection: { _id: 1, name: 1 } }).toArray()).map((c) => [c._id, c.name]));
  const summary: HostSummary = { totalHosts: 0, attached: 0, verified: 0, sslActive: 0, needsDns: 0, ownedElsewhere: 0, failed: 0 };
  const problems: HostProblem[] = [];
  let after: string | null = null;
  for (;;) {
    const docs: CompanyDomain[] = await db
      .collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION)
      .find(after ? { _id: { $gt: after } } : {}, { projection: { _id: 1, companyId: 1, kind: 1, provider: 1, appProvider: 1 } })
      .sort({ _id: 1 })
      .limit(PAGE)
      .toArray();
    if (!docs.length) break;
    for (const d of docs) {
      const hosts: [string, NonNullable<CompanyDomain["provider"]> | undefined][] = [
        [d._id, d.provider],
        [d.kind === "subdomain" ? (() => { const [l, ...r] = d._id.split("."); return `${l}${APP_SLUG_SUFFIX}.${r.join(".")}`; })() : `app.${d._id.replace(/^www\./, "")}`, d.appProvider],
      ];
      for (const [host, p] of hosts) {
        summary.totalHosts++;
        if (p?.attached) summary.attached++;
        if (p?.verified) summary.verified++;
        if (p?.attached && p.verified && p.dnsConfigured && !p.error) summary.sslActive++;
        else if (p?.attached && !p.dnsConfigured && !p.error) summary.needsDns++;
        const kind = p?.syncStatus === "owned_elsewhere" ? "owned_elsewhere" : p?.error || p?.syncStatus === "failed" ? "failed" : null;
        if (kind === "owned_elsewhere") summary.ownedElsewhere++;
        else if (kind === "failed") summary.failed++;
        if (kind && problems.length < problemLimit) {
          problems.push({ host, companyId: d.companyId, companyName: names.get(d.companyId) ?? d.companyId, kind, reason: p?.error ?? "", records: (p?.records ?? []).map((r) => ({ type: r.type, name: r.name, value: r.value })), checkedAt: p?.checkedAt ? new Date(p.checkedAt).toISOString() : null });
        }
      }
    }
    after = docs[docs.length - 1]._id;
    if (docs.length < PAGE) break;
  }
  return { summary, problems };
}

export interface PlatformHostView {
  host: string;
  role: string;
  redirectTo: string | null;
  attached: boolean;
  verified: boolean;
  dnsConfigured: boolean;
  error: string | null;
  records: { type: string; name: string; value: string }[];
  checkedAt: string | null;
}

/** The stored state of the platform's own hosts (what the last sync saw). */
export async function platformHostStates(): Promise<Map<string, PlatformHostView>> {
  const rows = await (await getPlatformDb()).collection<Record<string, unknown> & { _id: string }>(PLATFORM_HOSTS).find({}).toArray();
  return new Map(
    rows.map((r) => [
      r._id,
      { host: r._id, role: String(r.role ?? ""), redirectTo: (r.redirectTo as string) ?? null, attached: Boolean(r.attached), verified: Boolean(r.verified), dnsConfigured: Boolean(r.dnsConfigured), error: (r.error as string) ?? null, records: ((r.records as { type: string; name: string; value: string }[]) ?? []).map((x) => ({ type: x.type, name: x.name, value: x.value })), checkedAt: r.checkedAt ? new Date(r.checkedAt as Date).toISOString() : null },
    ]),
  );
}
