import type { DomainStatus } from "@/lib/platform/domains/types";
import { emptyCounts, type HostWrite, type SyncAction, type SyncCounts, type SyncStore, type SyncTarget, type VercelDomainsApi } from "@/lib/platform/domains/sync/types";

/**
 * Domain sync engine: makes the CURRENT Vercel project carry every host the database says exists (each company's automatic
 * addresses and its customers' own domains). Pure: talks only to the small interfaces in `types.ts`, so it is tested with fakes.
 *
 * Safe by construction: never deletes data; the only "removal" is releasing a host from the OLD project (when one is given),
 * and only right before attaching it to the new one. Idempotent (a host already attached and healthy costs no API call),
 * resumable (the cursor only moves after a whole batch finished), and one failing host never stops the others.
 */

export interface EngineDeps {
  api: VercelDomainsApi;
  /** The previous project (migration): hosts are released from it before they are attached to the new one. */
  old?: Pick<VercelDomainsApi, "removeDomain"> | null;
  store: SyncStore;
  /** `*.<root>` is attached to the project: automatic company addresses need nothing per company. */
  wildcard: boolean;
  /** True for a host the wildcard covers (only consulted when `wildcard`). */
  coveredByWildcard: (host: string) => boolean;
  now?: () => number;
  /** `*.<root>`: when given, the result says whether it is on the project (and verified). */
  wildcardHost?: string;
}

export interface EngineOptions {
  dryRun: boolean;
  /** Stop after about this long (ms), at a batch boundary. */
  budgetMs: number;
  /** Stop after this many companies in this call. */
  limit?: number;
  cursor: string | null;
  concurrency?: number;
  batchSize?: number;
  counts?: SyncCounts;
  /** The platform's own hosts (root, www, app, wildcard): synced first, once at the start of a run. */
  platformTargets?: SyncTarget[];
  /** Called after every finished batch (save progress, renew a lease). */
  onProgress?: (cursor: string | null, counts: SyncCounts) => Promise<void>;
}

export interface EngineResult {
  cursor: string | null;
  done: boolean;
  stoppedBy: "end" | "budget" | "limit";
  counts: SyncCounts;
  /** Present when `wildcardHost` was given: is the wildcard attached to the project and verified? */
  wildcard?: { attached: boolean; verified: boolean };
}

/** Every page of the project's domains, as a set. Throws when the list can't be read (the sync must not guess). */
export async function loadProjectDomains(api: VercelDomainsApi): Promise<Set<string>> {
  return (await loadProjectDomainInfo(api)).names;
}

export async function loadProjectDomainInfo(api: VercelDomainsApi): Promise<{ names: Set<string>; unverified: Set<string> }> {
  const names = new Set<string>();
  const unverified = new Set<string>();
  let cursor: string | null = null;
  for (let pages = 0; pages < 10_000; pages++) {
    const res = await api.listDomains(cursor);
    if (!res.ok) throw new Error(`Couldn't list the project's domains: ${res.error}`);
    for (const n of res.value.names) names.add(n.toLowerCase());
    for (const n of res.value.unverified ?? []) unverified.add(n.toLowerCase());
    if (!res.value.next) return { names, unverified };
    cursor = res.value.next;
  }
  throw new Error("The project's domain list never ended");
}

/**
 * The stored status is only a CACHE: whether a host is attached comes from the live domain list of the CURRENT project, and "verified" from
 * that list's own flag. A host is "already fine" only when the live list says it is attached and verified; the cache can then at most skip
 * a status call. Hosts without a stored record (`docId` null) have no cache and are fine when live-verified.
 */
const cacheHealthy = (t: SyncTarget) => !t.docId || Boolean(t.stored?.attached && t.stored.verified && t.stored.dnsConfigured && t.stored.syncStatus !== "owned_elsewhere" && t.stored.syncStatus !== "failed");

function writeFrom(status: DomainStatus): HostWrite {
  return { attached: status.attached, verified: status.verified, dnsConfigured: status.dnsConfigured, records: status.records, error: null, syncStatus: "ok" };
}

export const OWNED_MESSAGE =
  "This address is still attached to another Vercel project or account. Next step for the domain owner: remove it from the old Vercel project (its Domains tab), or publish the verification (TXT) record shown below. It then moves to this project automatically.";

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

export interface HostContext {
  /** Hosts the live list reports as NOT verified (ownership not proven for this project). */
  unverified?: Set<string>;
  /** Collects the hosts that were checked and are fine, so their "last checked" can be refreshed in one write. */
  okSink?: SyncTarget[];
}

/** One host. Never throws. */
export async function syncHost(deps: EngineDeps, target: SyncTarget, projectHosts: Set<string>, dryRun: boolean, counts: SyncCounts, ctx: HostContext = {}): Promise<void> {
  const { api, old, store } = deps;
  const host = target.host;
  const note = async (action: SyncAction, detail: string) => store.event({ host, companyId: target.companyId, action, detail }).catch(() => {});
  const wordy = target.kind !== "subdomain" && target.kind !== "subdomain-app"; // log every fine custom/platform host; the per-company subdomains would flood the log
  /** Saves what the live check found and counts/logs it: a host that is on the project but unverified needs a TXT record (or release from the old project). */
  const settle = async (st: DomainStatus, how: "attached" | "refreshed") => {
    const needsTxt = !st.verified;
    if (needsTxt && target.kind === "platform") {
      // The platform's own hosts (the wildcard above all) need the DNS zone's nameservers at this account: not an "owned elsewhere" case.
      await store.saveHost(target, { attached: st.attached, verified: false, dnsConfigured: st.dnsConfigured, records: st.records, error: "Not verified yet. Point this domain's nameservers (or DNS) at this Vercel account.", syncStatus: "ok" });
      await note("refreshed", "On the project but not verified yet (DNS authority)");
      return;
    }
    if (needsTxt) {
      await store.saveHost(target, { attached: st.attached, verified: false, dnsConfigured: st.dnsConfigured, records: st.records, error: OWNED_MESSAGE, syncStatus: "owned_elsewhere" });
      counts.ownedElsewhere++;
      await note("needs_txt", `On this project but not verified: ${st.records.filter((r) => r.type === "TXT").map((r) => `${r.name} TXT ${r.value}`).join("; ") || "no record returned yet"}`);
      return;
    }
    await store.saveHost(target, writeFrom(st));
    counts[how === "attached" ? "attached" : "refreshed"]++;
    await note(how === "attached" ? "attached" : "refreshed", st.dnsConfigured ? "Verified, SSL can be issued" : "On the project; waiting for DNS");
  };
  try {
    counts.hosts++;
    if (host.endsWith(".localhost")) return;
    if (deps.wildcard && (target.kind === "subdomain" || target.kind === "subdomain-app") && deps.coveredByWildcard(host)) {
      counts.skippedWildcard++;
      return;
    }
    const onProject = projectHosts.has(host);
    const liveVerified = onProject && !(ctx.unverified?.has(host) ?? false);
    if (onProject && liveVerified && cacheHealthy(target)) {
      counts.alreadyOk++;
      ctx.okSink?.push(target);
      if (wordy) await note("already_attached", "Already attached to this project and verified");
      return;
    }
    if (onProject) {
      // On the live list but not known to be good: look at it now. An unverified host may still be held by the previous project: release it there first.
      if (dryRun) {
        counts.refreshed++;
        await note("would_refresh", liveVerified ? "On the project; its stored status would be refreshed" : "On the project but not verified; would be released from the previous project (if set) and re-checked");
        return;
      }
      if (!liveVerified && old) {
        const rel = await old.removeDomain(host);
        if (rel.ok) {
          counts.released++;
          await note("released", "Released from the previous project");
        } else await note("release_failed", rel.error);
      }
      const st = !liveVerified && api.verifyDomain ? await api.verifyDomain(host) : await api.domainStatus(host);
      if (!st.ok) throw new Error(st.error);
      if (!st.value) {
        projectHosts.delete(host); // vanished since the list was read: attach it on the next pass
        throw new Error("The host disappeared from the project while syncing; the next run attaches it");
      }
      await settle(st.value, "refreshed");
      return;
    }

    // Missing from the live list: attach it (releasing it from the previous project first when one is set).
    if (dryRun) {
      counts.wouldAttach++;
      if (old) counts.wouldRelease++;
      if (old) await note("would_release", "Would be released from the previous project");
      await note("would_attach", "Would be attached to the project");
      return;
    }
    let released = false;
    if (old) {
      const rel = await old.removeDomain(host);
      if (rel.ok) {
        released = true;
        counts.released++;
        await note("released", "Released from the previous project");
      } else await note("release_failed", rel.error); // still try to attach: if it is free it works, else it is reported as owned elsewhere
    }
    const added = await api.addDomain(host, target.redirectTo ? { redirectTo: target.redirectTo } : undefined);
    if (added.ok) {
      projectHosts.add(host);
      await settle(added.value, "attached");
      if (released && added.value.verified) await note("attached", "Moved from the previous project");
      return;
    }
    if (added.ownedElsewhere) {
      await store.saveHost(target, { attached: false, verified: false, dnsConfigured: false, records: added.ownedElsewhere.records, error: OWNED_MESSAGE, syncStatus: "owned_elsewhere" });
      counts.ownedElsewhere++;
      await note("owned_elsewhere", added.error);
      return;
    }
    throw new Error(added.error);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    counts.failed++;
    await note("failed", message);
    if (!dryRun) {
      await store
        .saveHost(target, { attached: Boolean(target.stored?.attached), verified: Boolean(target.stored?.verified), dnsConfigured: Boolean(target.stored?.dnsConfigured), records: [], error: message, syncStatus: "failed" })
        .catch(() => {});
    }
  }
}

/** Walks companies from `cursor`, a batch at a time, until the end, the budget or the limit. Idempotent: calling it again continues or repeats safely. */
export async function syncDomains(deps: EngineDeps, opts: EngineOptions): Promise<EngineResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const counts = opts.counts ?? emptyCounts();
  const info = await loadProjectDomainInfo(deps.api);
  const projectHosts = info.names;
  const wildcard = deps.wildcardHost ? { attached: info.names.has(deps.wildcardHost), verified: info.names.has(deps.wildcardHost) && !info.unverified.has(deps.wildcardHost) } : undefined;
  const concurrency = opts.concurrency ?? 5;
  let cursor = opts.cursor;
  let handled = 0;
  const touch = async (ok: SyncTarget[]) => {
    if (ok.length && !opts.dryRun) await deps.store.touchHosts?.(ok).catch(() => {});
  };
  if (opts.platformTargets?.length) {
    const ok: SyncTarget[] = [];
    await pool(opts.platformTargets, concurrency, (t) => syncHost(deps, t, projectHosts, opts.dryRun, counts, { unverified: info.unverified, okSink: ok }));
    await touch(ok);
  }
  for (;;) {
    if (opts.limit !== undefined && handled >= opts.limit) return { cursor, done: false, stoppedBy: "limit", counts, wildcard };
    if (now() - started >= opts.budgetMs) return { cursor, done: false, stoppedBy: "budget", counts, wildcard };
    const size = Math.min(opts.batchSize ?? 20, opts.limit !== undefined ? opts.limit - handled : Infinity);
    const batch = await deps.store.loadBatch(cursor, size);
    if (batch.companies.length === 0) return { cursor: null, done: true, stoppedBy: "end", counts, wildcard };
    const ok: SyncTarget[] = [];
    await pool(
      batch.companies.flatMap((c) => c.targets),
      concurrency,
      (t) => syncHost(deps, t, projectHosts, opts.dryRun, counts, { unverified: info.unverified, okSink: ok }),
    );
    await touch(ok); // hosts that were checked and are fine get a fresh "last checked"

    counts.companies += batch.companies.length;
    handled += batch.companies.length;
    cursor = batch.companies[batch.companies.length - 1].companyId; // moves only after the whole batch finished
    await opts.onProgress?.(cursor, counts).catch(() => {});
    if (batch.next === null) return { cursor: null, done: true, stoppedBy: "end", counts, wildcard };
  }
}

/**
 * The hosts one company needs on the project, from what the database holds (pure).
 * `domains` are the company's `company_domains` documents.
 */
export function buildTargets(
  company: { _id: string; slug: string },
  domains: { _id: string; kind?: "subdomain" | "custom"; provider?: Partial<{ attached: boolean; verified: boolean; dnsConfigured: boolean; challenged: boolean; syncStatus: "ok" | "owned_elsewhere" | "failed" }>; appProvider?: Partial<{ attached: boolean; verified: boolean; dnsConfigured: boolean; challenged: boolean; syncStatus: "ok" | "owned_elsewhere" | "failed" }> }[],
  ctx: { root: string; appSuffix: string; isPlatformHost: (host: string) => boolean },
): SyncTarget[] {
  const out: SyncTarget[] = [];
  const seen = new Set<string>();
  const stored = (p: (typeof domains)[number]["provider"]): SyncTarget["stored"] =>
    p ? { attached: Boolean(p.attached), verified: Boolean(p.verified), dnsConfigured: Boolean(p.dnsConfigured), challenged: Boolean(p.challenged), syncStatus: p.syncStatus } : null;
  const add = (t: SyncTarget) => {
    if (seen.has(t.host) || ctx.isPlatformHost(t.host)) return;
    seen.add(t.host);
    out.push(t);
  };
  const ownSub = `${company.slug}.${ctx.root}`;
  const subs = domains.filter((d) => d.kind === "subdomain" || d._id === ownSub);
  if (!subs.some((d) => d._id === ownSub)) subs.push({ _id: ownSub });
  for (const d of subs) {
    const [label, ...rest] = d._id.split(".");
    const has = domains.includes(d);
    add({ host: d._id, companyId: company._id, kind: "subdomain", docId: has ? d._id : null, field: "provider", stored: stored(d.provider) });
    add({ host: `${label}${ctx.appSuffix}.${rest.join(".")}`, companyId: company._id, kind: "subdomain-app", docId: has ? d._id : null, field: "appProvider", stored: stored(d.appProvider) });
  }
  const customs = domains.filter((x) => !subs.includes(x));
  for (const d of customs) {
    add({ host: d._id, companyId: company._id, kind: "custom", docId: d._id, field: "provider", stored: stored(d.provider) });
    add({ host: `app.${d._id.replace(/^www\./, "")}`, companyId: company._id, kind: "custom-app", docId: d._id, field: "appProvider", stored: stored(d.appProvider) });
  }
  // The website is served with or without "www." (routing treats them as one domain): attach the counterpart too, unless the company defines it itself.
  for (const d of customs) {
    const alt = d._id.startsWith("www.") ? d._id.slice(4) : `www.${d._id}`;
    if (alt.includes(".") && !customs.some((x) => x._id === alt)) add({ host: alt, companyId: company._id, kind: "custom-alt", docId: null, field: "provider", stored: null });
  }
  return out;
}
