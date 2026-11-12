import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ENV_CLASSES, KEYRING_ENV, OVERLAY_ENV } from "../src/lib/platform/portability/env-classes";
import { platformHostPlan } from "../src/lib/platform/domains/sync/platform-hosts";
import { classifyDnsAuthority, planDnsCopy } from "../src/lib/platform/domains/sync/dns";
import { buildTargets, syncDomains } from "../src/lib/platform/domains/sync/engine";
import type { HostWrite, SyncStore, SyncTarget, VercelDomainsApi } from "../src/lib/platform/domains/sync/types";

// Pure: fakes only. Run with: npx tsx scripts/test-portability.ts
let n = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  n++;
  console.log("  ✓", name);
};

(async () => {
  await t("every environment variable read in src is classified (bootstrap | adopted | deployment-bound | optional)", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) files.push(p);
      }
    };
    walk("src");
    const unknown = new Map<string, string>();
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)|process\.env\["([A-Z][A-Z0-9_]*)"\]/g)) {
        const name = m[1] ?? m[2];
        if (name.startsWith("NEXT_PUBLIC_") || name in ENV_CLASSES) continue;
        unknown.set(name, f);
      }
    }
    assert.deepEqual([...unknown], [], `unclassified env vars (add them to src/lib/platform/portability/env-classes.ts): ${[...unknown].map(([k, f]) => `${k} (${f})`).join(", ")}`);
  });
  await t("only MONGODB_URI and SAAS_HOSTS are bootstrap; deployment-bound ones are never adopted", () => {
    assert.deepEqual(Object.entries(ENV_CLASSES).filter(([, c]) => c === "bootstrap").map(([k]) => k).sort(), ["MONGODB_URI", "SAAS_HOSTS"]);
    for (const k of ["VERCEL_PROJECT_ID", "VERCEL_TEAM_ID", "VERCEL_URL", "CRON_SECRET", "SAAS_ADMIN_EMAIL", "SAAS_ADMIN_PASSWORD"]) {
      assert.equal(ENV_CLASSES[k], "deployment-bound", k);
      assert.ok(!OVERLAY_ENV.includes(k) && !(k in KEYRING_ENV), k);
    }
    assert.ok(OVERLAY_ENV.includes("GITHUB_DISPATCH_TOKEN") && OVERLAY_ENV.includes("DESKTOP_BUILD_SECRET"));
    assert.deepEqual(Object.keys(KEYRING_ENV).sort(), ["DLMS_ENCRYPTION_KEY", "FMS_ENCRYPTION_KEY", "HRMS_ENCRYPTION_KEY", "PLATFORM_ENCRYPTION_KEY_PREVIOUS", "SMMS_ENCRYPTION_KEY", "SMMS_ENCRYPTION_KEY_PREVIOUS"]);
  });

  await t("platform hosts come from SAAS_HOSTS only: root (redirect to www), www, app, wildcard", () => {
    const plan = platformHostPlan("Acme-Example.com, www.other.org", "acme-example.com");
    assert.deepEqual(plan.map((p) => `${p.role}:${p.host}${p.redirectTo ? ">" + p.redirectTo : ""}`), ["root:acme-example.com>www.acme-example.com", "www:www.acme-example.com", "app:app.acme-example.com", "root:other.org>www.other.org", "www:www.other.org", "app:app.other.org", "wildcard:*.acme-example.com"]);
    assert.deepEqual(platformHostPlan("localhost", "localhost"), []);
    assert.deepEqual(platformHostPlan(undefined, undefined), []);
    assert.ok(!platformHostPlan("x.com", "x.vercel.app").some((p) => p.role === "wildcard"));
  });

  await t("DNS authority: this team, another team, external, unknown, in plain words", () => {
    const here = classifyDnsAuthority({ root: "x.com", inThisTeam: { serviceType: "zeit.world" }, nameservers: ["ns1.vercel-dns.com"] });
    assert.equal(here.where, "this-team");
    assert.equal(classifyDnsAuthority({ root: "x.com", inThisTeam: null, nameservers: ["ns1.vercel-dns.com", "ns2.vercel-dns.com"] }).where, "other-team");
    assert.match(classifyDnsAuthority({ root: "x.com", inThisTeam: null, nameservers: ["ns1.vercel-dns.com"] }).next, /Transfer to another team/);
    assert.equal(classifyDnsAuthority({ root: "x.com", inThisTeam: { serviceType: "external" }, nameservers: ["a.ns.cloudflare.com"] }).where, "external");
    assert.equal(classifyDnsAuthority({ root: "x.com", inThisTeam: null, nameservers: ["a.ns.cloudflare.com"] }).where, "external");
    assert.equal(classifyDnsAuthority({ root: "x.com", inThisTeam: null, nameservers: null }).where, "unknown");
  });

  await t("DNS copy plan: never NS/SOA, never Vercel-managed, never duplicates, nothing deleted", () => {
    const source = [
      { name: "@", type: "MX", value: "mail.example.com", mxPriority: 10 },
      { name: "@", type: "TXT", value: "v=spf1 -all" },
      { name: "@", type: "NS", value: "ns1.vercel-dns.com" },
      { name: "@", type: "SOA", value: "x" },
      { name: "*", type: "CNAME", value: "cname.vercel-dns.com" },
      { name: "@", type: "A", value: "76.76.21.21" },
      { name: "sys", type: "TXT", value: "managed", creator: "system" },
      { name: "dkim", type: "TXT", value: "k=1" },
    ];
    const plan = planDnsCopy(source, [{ name: "dkim", type: "TXT", value: "k=1" }]);
    assert.deepEqual(plan.create.map((r) => `${r.type}:${r.name}`), ["MX:@", "TXT:@"]);
    assert.deepEqual(plan.skipped.map((s) => s.reason).sort(), ["already-there", "managed-by-vercel", "managed-by-vercel", "managed-by-vercel", "nameserver-or-soa", "nameserver-or-soa"]);
  });

  await t("5,000 companies and 2,000 custom domains: planning, sync, idempotency and resume (fakes)", async () => {
    const ROOT = "tenant-root.test";
    const ctx = { root: ROOT, appSuffix: "-app", isPlatformHost: (h: string) => h === `www.${ROOT}` || h === ROOT || h === `app.${ROOT}` };
    const companies = Array.from({ length: 5000 }, (_, i) => {
      const id = `c${String(i).padStart(5, "0")}`;
      const slug = `biz${i}`;
      const customs = i < 2000 ? [`www.customer${i}.example`] : [];
      const docs = [{ _id: `${slug}.${ROOT}`, kind: "subdomain" as const }, ...customs.map((d) => ({ _id: d, kind: "custom" as const }))];
      return { id, targets: buildTargets({ _id: id, slug }, docs, ctx) as SyncTarget[] };
    });
    const total = companies.reduce((a, c) => a + c.targets.length, 0);
    assert.equal(total, 5000 * 2 + 2000 * 3, "two hosts per company address and, per custom domain, the website, its app. host and the www/apex counterpart");
    const hosts = new Set<string>();
    for (const c of companies) for (const x of c.targets) hosts.add(x.host);
    assert.equal(hosts.size, total, "no two companies share a host");

    const attached = new Set<string>();
    const saved = new Map<string, HostWrite>();
    let adds = 0;
    const api: VercelDomainsApi = {
      listDomains: async (cursor) => {
        const all = [...attached];
        const from = cursor ? Number(cursor) : 0;
        return { ok: true, value: { names: all.slice(from, from + 100), next: from + 100 < all.length ? String(from + 100) : null } };
      },
      addDomain: async (h) => {
        adds++;
        attached.add(h);
        return { ok: true, value: { attached: true, verified: true, dnsConfigured: true, records: [] } };
      },
      domainStatus: async (h) => ({ ok: true, value: attached.has(h) ? { attached: true, verified: true, dnsConfigured: true, records: [] } : null }),
      removeDomain: async () => ({ ok: true, value: null }),
    };
    const store: SyncStore = {
      async loadBatch(cursor, size) {
        const rest = companies.filter((c) => !cursor || c.id > cursor).slice(0, size);
        return { companies: rest.map((c) => ({ companyId: c.id, targets: c.targets })), next: rest.length < size ? null : rest[rest.length - 1].id };
      },
      saveHost: async (tg, w) => void saved.set(tg.host, w),
      event: async () => {},
    };
    const deps = { api, store, wildcard: false, coveredByWildcard: () => false };
    // a partial run (limit), then resume from its cursor
    const first = await syncDomains(deps, { dryRun: false, budgetMs: 600_000, cursor: null, limit: 1500, batchSize: 100 });
    assert.equal(first.done, false);
    const second = await syncDomains(deps, { dryRun: false, budgetMs: 600_000, cursor: first.cursor, counts: first.counts, batchSize: 100 });
    assert.equal(second.done, true);
    assert.equal(attached.size, total);
    assert.equal(second.counts.failed, 0);
    // idempotent: the database now holds the stored state, a further run attaches nothing
    for (const c of companies) for (const x of c.targets) x.stored = { attached: true, verified: true, dnsConfigured: true, challenged: false, syncStatus: "ok" };
    const before = adds;
    const third = await syncDomains(deps, { dryRun: false, budgetMs: 600_000, cursor: null, batchSize: 100 });
    assert.equal(adds, before);
    assert.equal(third.counts.alreadyOk, total);
    // wildcard mode: only custom domains are attached
    attached.clear();
    for (const c of companies) for (const x of c.targets) x.stored = null;
    const w = await syncDomains({ ...deps, wildcard: true, coveredByWildcard: (h) => h.endsWith(`.${ROOT}`) }, { dryRun: false, budgetMs: 600_000, cursor: null, batchSize: 100 });
    assert.equal(w.counts.skippedWildcard, 10000);
    assert.equal(attached.size, 6000);
  });

  console.log(`\n${n} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
