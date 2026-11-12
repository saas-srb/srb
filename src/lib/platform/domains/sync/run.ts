import "server-only";
import { randomUUID } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION } from "@/lib/platform/tenancy/companies";
import { isSubdomainOfRoot } from "@/lib/platform/tenancy/root-domain";
import { platformRootDomain, wildcardSubdomainsEnabled } from "@/lib/platform/tenancy/provisioning";
import { loadIntegrationsDoc } from "@/lib/platform/integrations/store";
import { domainConfigFrom, previousVercelConfigFrom } from "@/lib/platform/integrations/resolve";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { acquireLease, releaseLease, renewLease } from "@/lib/cron/lease";
import { syncDomains } from "@/lib/platform/domains/sync/engine";
import { withDiscoveredTeam } from "@/lib/platform/domains/vercel";
import { createVercelDomainsApi } from "@/lib/platform/domains/sync/vercel-api";
import { createMongoSyncStore, platformHostStates, recentEvents, runs, summarizeHosts, type SyncRun } from "@/lib/platform/domains/sync/store";
import { platformHostPlan } from "@/lib/platform/domains/sync/platform-hosts";
import { emptyCounts, type SyncCounts, type SyncTarget } from "@/lib/platform/domains/sync/types";

/**
 * Runs Domain sync (see `engine.ts`): one run at a time, resumable from its company cursor, driven by whoever is around
 * (the daily cron, the Console page, a config save, a first boot). A lease in the shared platform database makes sure only one
 * deployment works on it at any moment, even when two Vercel projects share the database during a move.
 */

const LEASE_KEY = "domain-sync";
const LEASE_SECONDS = 330;
const STALE_RUN_MS = 30 * 60_000;

export type Trigger = SyncRun["trigger"];

export interface DomainSyncOptions {
  dryRun?: boolean;
  /** Process at most this many companies in this call. */
  limit?: number;
  /** Start from after this company id (a new run only). */
  cursor?: string | null;
  /** Replace a run in progress instead of continuing it. */
  restart?: boolean;
  budgetMs?: number;
  by?: string | null;
  trigger?: Trigger;
}

export interface DomainSyncReport {
  runId: string | null;
  status: SyncRun["status"] | "not_configured" | "busy";
  done: boolean;
  cursor: string | null;
  counts: SyncCounts;
  message: string | null;
}

async function activeRun(): Promise<SyncRun | null> {
  const col = await runs();
  const run = await col.findOne({ status: "running" }, { sort: { startedAt: -1 } });
  if (run && Date.now() - run.updatedAt.getTime() > STALE_RUN_MS) {
    await col.updateOne({ _id: run._id }, { $set: { status: "failed", error: "Stopped: no progress for 30 minutes. Start it again.", finishedAt: new Date() } });
    return null;
  }
  return run;
}

/** Starts a run (or returns the one in progress). Never touches Vercel. */
export async function startDomainSync(opts: DomainSyncOptions = {}): Promise<{ run: SyncRun; alreadyRunning: boolean } | { run: null; error: string }> {
  let existing = await activeRun();
  if (existing && opts.restart) {
    // "Sync all domains now" always starts from the first company: a run that was stuck or half-done is replaced, never silently continued.
    await (await runs()).updateOne({ _id: existing._id }, { $set: { status: "failed", error: "Replaced by a new run.", finishedAt: new Date() } });
    existing = null;
  }
  if (existing) return { run: existing, alreadyRunning: true };
  const doc = await loadIntegrationsDoc();
  const cfg = domainConfigFrom(doc);
  if (cfg.provider !== "vercel" || !cfg.vercel) return { run: null, error: "Vercel isn't configured (Console → Integrations → Domains & hosting)." };
  const old = previousVercelConfigFrom(doc);
  const now = new Date();
  const run: SyncRun = {
    _id: randomUUID(),
    status: "running",
    dryRun: Boolean(opts.dryRun),
    trigger: opts.trigger ?? "manual",
    by: opts.by ?? null,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    cursor: opts.cursor ?? null,
    companiesTotal: await (await getPlatformDb()).collection(COMPANIES_COLLECTION).countDocuments({}),
    counts: emptyCounts(),
    releaseFromOld: Boolean(old && old.project !== cfg.vercel.project),
    projectId: cfg.vercel.project,
    error: null,
  };
  try {
    await (await runs()).insertOne(run);
  } catch {
    const again = await activeRun();
    if (again) return { run: again, alreadyRunning: true };
    return { run: null, error: "Couldn't start the sync." };
  }
  if (opts.by) await recordPlatformAudit({ actorId: opts.by, action: "domains.sync.start", target: { type: "domain_sync_run", id: run._id }, details: { dryRun: run.dryRun, trigger: run.trigger, releaseFromOld: run.releaseFromOld } });
  return { run, alreadyRunning: false };
}

/** Works on the run in progress for up to `budgetMs`. Safe to call from anywhere, any number of times. */
export async function runDomainSyncTick(opts: { budgetMs: number; limit?: number }): Promise<DomainSyncReport> {
  const holder = randomUUID();
  const run0 = await activeRun();
  if (!run0) return { runId: null, status: "done", done: true, cursor: null, counts: emptyCounts(), message: null };
  if (!(await acquireLease(LEASE_KEY, LEASE_SECONDS, holder))) return report(run0, "busy", "Another worker is already running the sync.");
  const col = await runs();
  try {
    const run = (await col.findOne({ _id: run0._id })) ?? run0;
    const doc = await loadIntegrationsDoc();
    const cfg = domainConfigFrom(doc);
    if (!cfg.vercel) {
      await col.updateOne({ _id: run._id }, { $set: { status: "failed", error: "Vercel isn't configured.", finishedAt: new Date() } });
      return report({ ...run, status: "failed" }, "not_configured", "Vercel isn't configured.");
    }
    const vc = await withDiscoveredTeam(cfg.vercel);
    const prev = previousVercelConfigFrom(doc);
    const old = prev && !(prev.project === vc.project && (prev.team ?? null) === (vc.team ?? null)) ? createVercelDomainsApi(prev) : null;
    const root = platformRootDomain();
    const res = await syncDomains(
      {
        api: createVercelDomainsApi(vc),
        old,
        wildcardHost: `*.${root}`,
        store: createMongoSyncStore(run._id, run.dryRun, root),
        wildcard: wildcardSubdomainsEnabled(),
        coveredByWildcard: (h) => isSubdomainOfRoot(h, root),
      },
      {
        dryRun: run.dryRun,
        platformTargets: run.cursor === null ? await platformTargetsFor(root) : undefined,
        budgetMs: opts.budgetMs,
        limit: opts.limit,
        cursor: run.cursor,
        counts: run.counts,
        onProgress: async (cursor, counts) => {
          await col.updateOne({ _id: run._id }, { $set: { cursor, counts, updatedAt: new Date() } });
          await renewLease(LEASE_KEY, LEASE_SECONDS, holder);
        },
      },
    );
    const finished = res.done;
    await col.updateOne({ _id: run._id }, { $set: { cursor: res.cursor, counts: res.counts, updatedAt: new Date(), ...(finished ? { status: "done" as const, finishedAt: new Date() } : {}) } });
    if (res.wildcard) await rememberWildcard(root, res.wildcard.attached && res.wildcard.verified);
    if (finished) await rememberProject(vc.project);
    return { runId: run._id, status: finished ? "done" : "running", done: finished, cursor: res.cursor, counts: res.counts, message: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The list of the project's domains couldn't be read (token / project wrong, outage): keep the run so the next call retries.
    await col.updateOne({ _id: run0._id }, { $set: { error: message, updatedAt: new Date() } });
    return report({ ...run0, error: message }, "running", message);
  } finally {
    await releaseLease(LEASE_KEY, holder);
  }
}

function report(run: SyncRun, status: DomainSyncReport["status"], message: string | null): DomainSyncReport {
  return { runId: run._id, status, done: run.status === "done", cursor: run.cursor, counts: run.counts, message };
}

/** The platform's own hosts as sync targets (derived from SAAS_HOSTS and the root domain). */
async function platformTargetsFor(root: string): Promise<SyncTarget[]> {
  const states = await platformHostStates().catch(() => new Map());
  return platformHostPlan(process.env.SAAS_HOSTS, root).map((p) => {
    const s = states.get(p.host);
    return { host: p.host, companyId: "platform", kind: "platform" as const, docId: null, field: "provider" as const, role: p.role, redirectTo: p.redirectTo, stored: s ? { attached: s.attached, verified: s.verified, dnsConfigured: s.dnsConfigured, challenged: false } : null };
  });
}

/** Start (or resume) a run and work on it now, up to the time budget (default about 4 minutes, the cron's window). */
export async function syncAllDomains(opts: DomainSyncOptions = {}): Promise<DomainSyncReport> {
  const started = await startDomainSync(opts);
  if (!started.run) return { runId: null, status: "not_configured", done: false, cursor: null, counts: emptyCounts(), message: started.error };
  return runDomainSyncTick({ budgetMs: opts.budgetMs ?? 240_000, limit: opts.limit });
}

/** Queue a run and start working on it right after the current response (a config save, a first boot). Best effort, never throws. */
export async function enqueueDomainSync(opts: { trigger: Trigger; by?: string | null }): Promise<void> {
  const started = await startDomainSync({ trigger: opts.trigger, by: opts.by ?? null });
  if (!started.run) return;
  const work = () => runDomainSyncTick({ budgetMs: 45_000 }).catch((err) => console.error("[domain-sync] background run failed", err));
  try {
    const { after } = await import("next/server");
    after(work);
  } catch {
    void work(); // outside a request (first boot)
  }
}

// ── Self-healing on a changed project ────────────────────────────────────────

const STATE_ID = "domain_sync_state";

/** Keeps what the sync saw of the wildcard (`*.<root>` on the project) so company addresses need no per-company attach (the env variable still overrides). */
async function rememberWildcard(root: string, attached: boolean): Promise<void> {
  const { INTEGRATIONS_DOC_ID, bustIntegrationsCache } = await import("@/lib/platform/integrations/store");
  await (await getPlatformDb()).collection("platform_settings").updateOne({ _id: INTEGRATIONS_DOC_ID as never }, { $set: { "domains.wildcard": { root, attached, checkedAt: new Date() } } }, { upsert: true });
  bustIntegrationsCache();
}

async function rememberProject(projectId: string): Promise<void> {
  await (await getPlatformDb()).collection<{ _id: string; lastProjectId?: string; at?: Date }>("platform_settings").updateOne({ _id: STATE_ID }, { $set: { lastProjectId: projectId, at: new Date() } }, { upsert: true });
}

/**
 * First boot of a deployment whose Vercel project differs from the last one that was fully synced: queue a sync.
 * Cheap (one small read) and silent when nothing changed or Vercel isn't configured.
 */
export async function maybeSyncOnProjectChange(): Promise<void> {
  const doc = await loadIntegrationsDoc();
  const cfg = domainConfigFrom(doc);
  if (cfg.provider !== "vercel" || !cfg.vercel) return;
  const state = await (await getPlatformDb()).collection<{ _id: string; lastProjectId?: string }>("platform_settings").findOne({ _id: STATE_ID });
  if (state?.lastProjectId === cfg.vercel.project) return;
  await enqueueDomainSync({ trigger: "boot" });
}

// ── For the Console ──────────────────────────────────────────────────────────

export interface DomainSyncOverview {
  run: (Omit<SyncRun, "startedAt" | "updatedAt" | "finishedAt"> & { startedAt: string; updatedAt: string; finishedAt: string | null }) | null;
  events: { at: string; host: string; companyId: string; action: string; detail: string; dryRun: boolean }[];
  configured: boolean;
  previousConfigured: boolean;
  wildcard: boolean;
}

export async function getDomainSyncOverview(): Promise<DomainSyncOverview> {
  const doc = await loadIntegrationsDoc();
  const cfg = domainConfigFrom(doc);
  const run = (await activeRun()) ?? (await (await runs()).findOne({}, { sort: { startedAt: -1 } }));
  const events = run ? await recentEvents(run._id, 100) : [];
  return {
    run: run ? { ...run, startedAt: run.startedAt.toISOString(), updatedAt: run.updatedAt.toISOString(), finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null } : null,
    events: events.map((e) => ({ at: e.at.toISOString(), host: e.host, companyId: e.companyId, action: e.action, detail: e.detail, dryRun: e.dryRun })),
    configured: cfg.provider === "vercel" && Boolean(cfg.vercel),
    previousConfigured: Boolean(previousVercelConfigFrom(doc)),
    wildcard: wildcardSubdomainsEnabled(),
  };
}

export { summarizeHosts };

// ── Retry one host ───────────────────────────────────────────────────────────

/** Re-runs the sync for one host (a failed or owned-elsewhere one), now. Staff only (the caller checks). */
export async function retryHostSync(rawHost: string, actorId: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const host = rawHost.trim().toLowerCase();
  const doc = await loadIntegrationsDoc();
  const cfg = domainConfigFrom(doc);
  if (!cfg.vercel) return { ok: false, error: "Vercel isn't configured." };
  const db = await getPlatformDb();
  const [first, ...rest] = host.split(".");
  const candidates = [host, `${first.replace(/-app$/, "")}.${rest.join(".")}`, host.replace(/^app\./, ""), host.replace(/^app\./, "www.")];
  const d = await db.collection<import("@/lib/platform/tenancy/companies").CompanyDomain>("company_domains").findOne({ _id: { $in: candidates } });
  if (!d) return { ok: false, error: "No company owns that address." };
  const company = await db.collection<import("@/lib/platform/tenancy/companies").Company>(COMPANIES_COLLECTION).findOne({ _id: d.companyId }, { projection: { _id: 1, slug: 1 } });
  if (!company) return { ok: false, error: "That address' company no longer exists." };
  const root = platformRootDomain();
  const { buildTargets, syncHost } = await import("@/lib/platform/domains/sync/engine");
  const { APP_SLUG_SUFFIX, isPlatformHost } = await import("@/lib/platform/tenancy/companies");
  const target = buildTargets(company, [d], { root, appSuffix: APP_SLUG_SUFFIX, isPlatformHost }).find((t) => t.host === host);
  if (!target) return { ok: false, error: "That address isn't one the platform manages." };
  const prev = previousVercelConfigFrom(doc);
  const counts = emptyCounts();
  await syncHost(
    {
      api: createVercelDomainsApi(await withDiscoveredTeam(cfg.vercel)),
      old: prev && prev.project !== cfg.vercel.project ? createVercelDomainsApi(prev) : null,
      store: createMongoSyncStore("retry", false, root),
      wildcard: wildcardSubdomainsEnabled(),
      coveredByWildcard: (h) => isSubdomainOfRoot(h, root),
    },
    { ...target, stored: null, docId: target.docId }, // never "already healthy": the point is to try again
    new Set(),
    false,
    counts,
    { unverified: new Set() },
  );
  await recordPlatformAudit({ actorId, action: "domains.sync.retry", companyId: company._id, target: { type: "company_domain", id: host }, details: { counts } });
  if (counts.failed) return { ok: false, error: "It still fails; see the reason in the list." };
  if (counts.ownedElsewhere) return { ok: false, error: "Still owned by another Vercel project or account; publish the verification record shown." };
  return { ok: true, message: `${host} is on the project.` };
}

// ── Platform hosts and DNS authority (Console) ───────────────────────────────

export interface PlatformHostsOverview {
  root: string;
  hosts: { host: string; role: string; redirectTo: string | null; attached: boolean; verified: boolean; dnsConfigured: boolean; error: string | null; checkedAt: string | null }[];
  previousConfigured: boolean;
}

export async function getPlatformHostsOverview(): Promise<PlatformHostsOverview> {
  const doc = await loadIntegrationsDoc();
  const root = platformRootDomain();
  const states = await platformHostStates().catch(() => new Map());
  return {
    root,
    previousConfigured: Boolean(previousVercelConfigFrom(doc)),
    hosts: platformHostPlan(process.env.SAAS_HOSTS, root).map((p) => {
      const s = states.get(p.host);
      return { host: p.host, role: p.role, redirectTo: p.redirectTo ?? null, attached: Boolean(s?.attached), verified: Boolean(s?.verified), dnsConfigured: Boolean(s?.dnsConfigured), error: s?.error ?? null, checkedAt: s?.checkedAt ?? null };
    }),
  };
}

/** Where the root domain's DNS zone lives, read through the current (or, failing that, the earlier) account's token. */
export async function checkDnsAuthority(): Promise<{ ok: true; where: string; next: string; root: string } | { ok: false; error: string }> {
  const doc = await loadIntegrationsDoc();
  const cfg = domainConfigFrom(doc);
  const root = platformRootDomain();
  if (root === "localhost") return { ok: false, error: "No root domain is known yet (set SAAS_HOSTS)." };
  const { detectDnsAuthority } = await import("@/lib/platform/domains/sync/vercel-dns-api");
  const token = cfg.vercel ? await withDiscoveredTeam(cfg.vercel) : previousVercelConfigFrom(doc);
  if (!token) return { ok: false, error: "No Vercel token saved yet: paste this account's token in Integrations → Domains & hosting first." };
  const res = await detectDnsAuthority(token, root);
  return { ok: true, where: res.where, next: res.next, root };
}

/** Copies DNS records from the earlier account's zone to this account's (dry run reports only; never deletes; skips Vercel-managed records). */
export async function copyDnsFromPreviousAccount(dryRun: boolean, actorId: string) {
  const doc = await loadIntegrationsDoc();
  const cfg = domainConfigFrom(doc);
  const prev = previousVercelConfigFrom(doc);
  const root = platformRootDomain();
  if (!cfg.vercel || !prev) return { ok: false as const, error: "Needs this account's token and the earlier account's token (Previous Vercel project)." };
  if (prev.token === cfg.vercel.token) return { ok: false as const, error: "Both tokens are the same account: nothing to copy." };
  const { copyDnsRecords } = await import("@/lib/platform/domains/sync/vercel-dns-api");
  const report = await copyDnsRecords({ from: prev, to: await withDiscoveredTeam(cfg.vercel), root, dryRun });
  await recordPlatformAudit({ actorId, action: "domains.dns.copy", target: { type: "domain", id: root }, details: { ...report, failed: report.failed.length } });
  return { ok: true as const, report };
}
