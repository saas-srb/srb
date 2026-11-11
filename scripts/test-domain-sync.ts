import assert from "node:assert/strict";
import { buildTargets, loadProjectDomains, syncDomains, type EngineDeps } from "../src/lib/platform/domains/sync/engine";
import { backoffDelayMs, retryAfterFromHeaders, withBackoff } from "../src/lib/platform/domains/sync/retry";
import { createVercelDomainsApi } from "../src/lib/platform/domains/sync/vercel-api";
import type { AddResult, HostWrite, SyncEvent, SyncStore, SyncTarget, VercelDomainsApi } from "../src/lib/platform/domains/sync/types";

// Pure: fakes only, no network and no database. Run with: npx tsx scripts/test-domain-sync.ts
let n = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  n++;
  console.log("  ✓", name);
};

const ROOT = "example.com";
const ctx = { root: ROOT, appSuffix: "-app", isPlatformHost: (h: string) => h === "www.example.com" };
const OK = { attached: true, verified: true, dnsConfigured: true, records: [] };

function company(i: number, customs: string[] = []) {
  const id = `c${String(i).padStart(4, "0")}`;
  const slug = `co${i}`;
  const docs = [{ _id: `${slug}.${ROOT}`, kind: "subdomain" as const }, ...customs.map((d) => ({ _id: d, kind: "custom" as const }))];
  return { id, targets: buildTargets({ _id: id, slug }, docs, ctx) };
}

function fakeStore(companies: { id: string; targets: SyncTarget[] }[]) {
  const saved: { host: string; write: HostWrite }[] = [];
  const events: SyncEvent[] = [];
  const loads: (string | null)[] = [];
  const store: SyncStore = {
    async loadBatch(cursor, size) {
      loads.push(cursor);
      const rest = companies.filter((c) => !cursor || c.id > cursor).slice(0, size);
      return { companies: rest.map((c) => ({ companyId: c.id, targets: c.targets })), next: rest.length < size ? null : rest[rest.length - 1].id };
    },
    async saveHost(target, write) {
      saved.push({ host: target.host, write });
    },
    async event(e) {
      events.push(e);
    },
  };
  return { store, saved, events, loads };
}

function fakeApi(initial: string[], opts: { pageSize?: number; owned?: Set<string>; failAdd?: Set<string>; log?: string[] } = {}) {
  const hosts = new Set(initial);
  const log = opts.log ?? [];
  const calls = { add: 0, remove: 0, status: 0, list: 0 };
  const api: VercelDomainsApi = {
    async listDomains(cursor) {
      calls.list++;
      const all = [...hosts];
      const size = opts.pageSize ?? 100;
      const from = cursor ? Number(cursor) : 0;
      return { ok: true, value: { names: all.slice(from, from + size), next: from + size < all.length ? String(from + size) : null } };
    },
    async addDomain(host): Promise<AddResult> {
      calls.add++;
      log.push(`new.add:${host}`);
      if (opts.owned?.has(host)) return { ok: false, error: "Vercel 409: domain already in use", ownedElsewhere: { records: [{ type: "TXT", name: "_vercel", value: "vc-domain-verify=x", reason: "Proves you own the domain" }] } };
      if (opts.failAdd?.has(host)) return { ok: false, error: "Vercel 500: boom" };
      hosts.add(host);
      return { ok: true, value: { ...OK, verified: true, dnsConfigured: false, records: [] } };
    },
    async domainStatus(host) {
      calls.status++;
      return { ok: true, value: hosts.has(host) ? OK : null };
    },
    async removeDomain(host) {
      calls.remove++;
      log.push(`remove:${host}`);
      hosts.delete(host);
      return { ok: true, value: null };
    },
  };
  return { api, hosts, calls, log };
}

const run = (deps: Partial<EngineDeps> & Pick<EngineDeps, "api" | "store">, o: Partial<Parameters<typeof syncDomains>[1]> = {}) =>
  syncDomains({ wildcard: false, coveredByWildcard: (h) => h.endsWith(`.${ROOT}`), ...deps }, { dryRun: false, budgetMs: 60_000, cursor: null, batchSize: 3, ...o });

(async () => {
  await t("targets: website + app host per company, custom domains get app.<domain>, platform hosts skipped", () => {
    const c = company(1, ["acme.com", "www.example.com"]);
    assert.deepEqual(c.targets.map((x) => `${x.kind}:${x.host}`), ["subdomain:co1.example.com", "subdomain-app:co1-app.example.com", "custom:acme.com", "custom-app:app.acme.com", "custom-app:app.example.com"]);
    assert.equal(buildTargets({ _id: "x", slug: "s" }, [], ctx)[0].docId, null, "a company with no record still gets its automatic hosts");
  });

  await t("pagination: every page of the project's domains is read", async () => {
    const f = fakeApi(Array.from({ length: 25 }, (_, i) => `h${i}.com`), { pageSize: 10 });
    assert.equal((await loadProjectDomains(f.api)).size, 25);
    assert.equal(f.calls.list, 3);
  });

  await t("attaches only the missing hosts and stores their status", async () => {
    const cs = [company(1), company(2, ["acme.com"])];
    const f = fakeApi(["co1.example.com"]);
    const s = fakeStore(cs);
    const res = await run({ api: f.api, store: s.store });
    assert.equal(res.done, true);
    assert.equal(res.counts.attached, 5, "co1-app, co2, co2-app, acme.com, app.acme.com");
    assert.equal(res.counts.refreshed, 1, "co1 is on the project but had no stored status");
    assert.ok(f.hosts.has("app.acme.com") && f.hosts.has("co2-app.example.com"));
    assert.equal(s.saved.length, 6);
  });

  await t("idempotent: a second run changes and calls nothing", async () => {
    const cs = [company(1), company(2, ["acme.com"])];
    const f = fakeApi([]);
    const s = fakeStore(cs);
    await run({ api: f.api, store: s.store });
    // the database now holds the stored state the first run wrote
    for (const c of cs) for (const x of c.targets) x.stored = { attached: true, verified: true, dnsConfigured: true, challenged: false, syncStatus: "ok" };
    const before = { ...f.calls };
    const again = await run({ api: f.api, store: s.store });
    assert.equal(again.counts.attached, 0);
    assert.equal(again.counts.alreadyOk, again.counts.hosts);
    assert.equal(f.calls.add, before.add);
    assert.equal(f.calls.status, before.status);
  });

  await t("409 owned by another project: recorded as owned_elsewhere with the TXT records, retried on the next run", async () => {
    const cs = [company(1, ["taken.com"])];
    const owned = new Set(["taken.com"]);
    const f = fakeApi([], { owned });
    const s = fakeStore(cs);
    const res = await run({ api: f.api, store: s.store });
    assert.equal(res.counts.ownedElsewhere, 1);
    assert.equal(res.counts.failed, 0);
    const w = s.saved.find((x) => x.host === "taken.com")!.write;
    assert.equal(w.syncStatus, "owned_elsewhere");
    assert.equal(w.attached, false);
    assert.equal(w.records[0].type, "TXT");
    assert.match(w.error ?? "", /another Vercel project/);
    // later: released elsewhere -> the next run attaches it
    owned.clear();
    const again = await run({ api: f.api, store: s.store });
    assert.ok(f.hosts.has("taken.com"));
    assert.equal(again.counts.ownedElsewhere, 0);
  });

  await t("wildcard: automatic company addresses are skipped, custom domains still attached", async () => {
    const cs = [company(1, ["acme.com"])];
    const f = fakeApi([]);
    const res = await run({ api: f.api, store: fakeStore(cs).store, wildcard: true });
    assert.equal(res.counts.skippedWildcard, 2);
    assert.deepEqual([...f.hosts].sort(), ["acme.com", "app.acme.com"]);
  });

  await t("release-then-attach: each host is removed from the old project BEFORE it is added to the new one", async () => {
    const log: string[] = [];
    const nw = fakeApi([], { log });
    const old = fakeApi(["acme.com"], { log });
    const res = await run({ api: nw.api, old: old.api, store: fakeStore([company(1, ["acme.com"])]).store });
    assert.equal(res.counts.released, res.counts.attached);
    for (const h of ["acme.com", "app.acme.com", "co1.example.com"]) assert.ok(log.indexOf(`remove:${h}`) >= 0 && log.indexOf(`remove:${h}`) < log.indexOf(`new.add:${h}`), h);
  });

  await t("a host already on the new project is never released from the old one", async () => {
    const nw = fakeApi(["acme.com"]);
    const old = fakeApi(["acme.com"]);
    const s = fakeStore([company(1, ["acme.com"])]);
    await run({ api: nw.api, old: old.api, store: s.store });
    assert.ok(old.hosts.has("acme.com"));
  });

  await t("resume after a cursor: only later companies are touched", async () => {
    const cs = [company(1), company(2), company(3), company(4)];
    const f = fakeApi([]);
    const s = fakeStore(cs);
    const first = await run({ api: f.api, store: s.store }, { limit: 2, batchSize: 1 });
    assert.equal(first.done, false);
    assert.equal(first.stoppedBy, "limit");
    assert.equal(first.cursor, "c0002");
    const hostsAfterFirst = f.hosts.size;
    const second = await run({ api: f.api, store: s.store }, { cursor: first.cursor, counts: first.counts, batchSize: 5 });
    assert.equal(second.done, true);
    assert.equal(second.counts.companies, 4);
    assert.equal(f.hosts.size, hostsAfterFirst + 4);
    assert.ok(s.loads.includes("c0002"));
  });

  await t("time budget stops at a batch boundary and returns a cursor", async () => {
    let clock = 0;
    const cs = [company(1), company(2), company(3)];
    const f = fakeApi([]);
    const store = fakeStore(cs).store;
    const res = await syncDomains(
      { api: f.api, store, wildcard: false, coveredByWildcard: () => false, now: () => clock },
      { dryRun: false, budgetMs: 1000, cursor: null, batchSize: 1, onProgress: async () => { clock += 600; } },
    );
    assert.equal(res.stoppedBy, "budget");
    assert.equal(res.done, false);
    assert.equal(res.counts.companies, 2);
    assert.equal(res.cursor, "c0002");
  });

  await t("dry run changes nothing anywhere", async () => {
    const nw = fakeApi([]);
    const old = fakeApi(["acme.com"]);
    const s = fakeStore([company(1, ["acme.com"])]);
    const res = await run({ api: nw.api, old: old.api, store: s.store }, { dryRun: true });
    assert.equal(nw.calls.add + nw.calls.remove + old.calls.remove, 0);
    assert.equal(s.saved.length, 0);
    assert.equal(nw.hosts.size, 0);
    assert.ok(old.hosts.has("acme.com"));
    assert.equal(res.counts.wouldAttach, 4);
    assert.ok(s.events.every((e) => e.action.startsWith("would_")));
  });

  await t("one failing host never stops the others", async () => {
    const f = fakeApi([], { failAdd: new Set(["co1-app.example.com"]) });
    const s = fakeStore([company(1), company(2)]);
    const res = await run({ api: f.api, store: s.store });
    assert.equal(res.counts.failed, 1);
    assert.equal(res.counts.attached, 3);
    assert.equal(s.saved.find((x) => x.host === "co1-app.example.com")!.write.syncStatus, "failed");
    assert.equal(res.done, true);
  });

  await t("concurrency is limited", async () => {
    let live = 0;
    let peak = 0;
    const f = fakeApi([]);
    const slow: VercelDomainsApi = { ...f.api, async addDomain(h) { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; return f.api.addDomain(h); } };
    await run({ api: slow, store: fakeStore(Array.from({ length: 8 }, (_, i) => company(i + 1))).store }, { batchSize: 8, concurrency: 5 });
    assert.ok(peak <= 5 && peak > 1, `peak ${peak}`);
  });

  await t("an unreadable project list aborts the run (no guessing)", async () => {
    const f = fakeApi([]);
    const bad: VercelDomainsApi = { ...f.api, listDomains: async () => ({ ok: false, error: "Vercel 403: forbidden" }) };
    await assert.rejects(run({ api: bad, store: fakeStore([company(1)]).store }), /forbidden/);
    assert.equal(f.calls.add, 0);
  });

  await t("backoff: 429 honours Retry-After, then succeeds; delays grow", async () => {
    assert.equal(backoffDelayMs(1), 500);
    assert.equal(backoffDelayMs(3), 2000);
    assert.equal(backoffDelayMs(2, 7000), 7000);
    assert.equal(retryAfterFromHeaders((h) => (h === "retry-after" ? "3" : null), 0), 3000);
    assert.equal(retryAfterFromHeaders((h) => (h === "x-ratelimit-reset" ? "10" : null), 4000), 6000);
    const waits: number[] = [];
    let calls = 0;
    const res = await withBackoff(async () => ({ status: ++calls < 3 ? 429 : 200, retryAfterMs: calls === 1 ? 1500 : null }), async (ms) => void waits.push(ms));
    assert.equal(res.status, 200);
    assert.deepEqual(waits, [1500, 1000]);
  });

  await t("real adapter (fake fetch): pagination, 429 retry, 409 mapping", async () => {
    const seen: string[] = [];
    let first429 = true;
    const fetchFn = (async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      seen.push(`${init?.method} ${url.pathname}${url.search}`);
      const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
      if (url.pathname === "/v9/projects/prj_new/domains" && !url.searchParams.get("until")) {
        if (first429) {
          first429 = false;
          return json(429, { error: { code: "rate_limited" } }, { "retry-after": "1" });
        }
        return json(200, { domains: [{ name: "a.com" }], pagination: { next: 1700 } });
      }
      if (url.pathname === "/v9/projects/prj_new/domains") return json(200, { domains: [{ name: "b.com" }], pagination: { next: null } });
      if (url.pathname === "/v10/projects/prj_new/domains") {
        const name = JSON.parse(String(init?.body)).name;
        if (name === "taken.com") return json(409, { error: { code: "domain_already_in_use", message: "in use", verification: [{ type: "TXT", domain: "_vercel.taken.com", value: "vc-domain-verify=1" }] } });
        return json(200, { name, verified: true });
      }
      if (url.pathname.startsWith("/v6/domains/")) return json(200, { misconfigured: false });
      return json(404, {});
    }) as typeof fetch;
    const waits: number[] = [];
    const api = createVercelDomainsApi({ token: "tok", project: "prj_new", team: "team_1" }, { fetchFn, sleep: async (ms) => void waits.push(ms), now: () => 0 });
    const p1 = await api.listDomains(null);
    assert.deepEqual(p1.ok && p1.value, { names: ["a.com"], unverified: [], next: "1700" });
    assert.deepEqual(waits, [1000]);
    const p2 = await api.listDomains("1700");
    assert.deepEqual(p2.ok && p2.value, { names: ["b.com"], unverified: [], next: null });
    assert.ok(seen.every((s) => s.includes("teamId=team_1")));
    const ok = await api.addDomain("fine.com");
    assert.ok(ok.ok && ok.value.dnsConfigured);
    const owned = await api.addDomain("taken.com");
    assert.ok(!owned.ok && owned.ownedElsewhere?.records[0].value === "vc-domain-verify=1");
    assert.equal((await api.removeDomain("gone.com")).ok, true, "404 counts as removed");
  });

  console.log(`\n${n} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
