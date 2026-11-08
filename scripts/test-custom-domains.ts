/**
 * Logic test for custom domains (`src/lib/platform/domains/custom.ts`), run
 * against a throwaway MongoDB database that is dropped at the end. DNS is
 * mocked (injected TXT resolver) and the hosting provider is the manual one,
 * so nothing touches the network.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/demo_domains_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-custom-domains.ts
 *
 * Never point MONGODB_URI at a real database: the script drops it.
 */

import assert from "node:assert/strict";

process.env.PLATFORM_ROOT_DOMAIN = "demo.test";
process.env.DOMAIN_PROVIDER = "manual";
delete process.env.PLATFORM_HOSTS;

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? err.message : String(err)}`);
  }
}

const A = "company-a";
const B = "company-b";

async function main() {
  const uri = process.env.MONGODB_URI ?? "";
  const dbName = new URL(uri.replace(/^mongodb(\+srv)?:/, "http:")).pathname.slice(1);
  if (!/test/.test(dbName)) throw new Error(`Refusing to run: MONGODB_URI must name a throwaway *test* database (got "${dbName || "(none)"}")`);

  const { getPlatformDb, clientPromise } = await import("@/lib/platform/tenancy/platform-db");

  const db = await getPlatformDb();
  try {
    await run(db);
  } finally {
    await db.dropDatabase();
    await (await clientPromise).close();
  }
}

async function run(db: import("mongodb").Db) {
  const { runAsCompany } = await import("@/lib/platform/tenancy/context");
  const { resolveCompanyIdByHost, forgetCompanyRouting } = await import("@/lib/platform/tenancy/companies");
  const { parseCustomDomain, addCustomDomain, verifyCustomDomain, setPrimaryDomain, removeCustomDomain, listCompanyDomains, recheckPendingDomains, MAX_CUSTOM_DOMAINS, VERIFY_LABEL } = await import("@/lib/platform/domains/custom");
  const domains = db.collection<{ _id: string; companyId: string; status: string; isPrimary: boolean; kind?: string; verificationToken: string; createdAt: Date }>("company_domains");
  const now = new Date();
  await db.collection<{ _id: string }>("companies").insertMany([
    { _id: A, slug: "alpha", name: "Alpha", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now },
    { _id: B, slug: "beta", name: "Beta", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now },
  ] as never[]);
  // These checks are about the domain rules, not the plan's allowance (the real Free plan includes 1 domain): the default plan gets room for the cap here.
  await (await import("@/lib/platform/billing/plans")).listPlans();
  await db.collection("billing_plans").updateMany({}, { $set: { "limits.customDomains": 50 } });
  await domains.insertMany([
    { _id: "alpha.demo.test", companyId: A, status: "verified", verificationToken: "t", isPrimary: true, kind: "subdomain", createdAt: now, verifiedAt: now },
    { _id: "beta.demo.test", companyId: B, status: "verified", verificationToken: "t", isPrimary: true, kind: "subdomain", createdAt: now, verifiedAt: now },
  ] as never[]);

  const asA = <T>(fn: () => Promise<T>) => runAsCompany(A, fn);
  const asB = <T>(fn: () => Promise<T>) => runAsCompany(B, fn);
  const notFound = async () => {
    throw Object.assign(new Error("queryTxt ENOTFOUND"), { code: "ENOTFOUND" });
  };
  const txtFor = (host: string, value: string) => async (name: string) => (name === `${VERIFY_LABEL}.${host}` ? [[value.slice(0, 10), value.slice(10)]] : []);
  const token = async (host: string) => (await domains.findOne({ _id: host }))!.verificationToken;

  console.log("Validation");
  await check("rejects malformed hosts", async () => {
    for (const bad of ["", "   ", "acme", "1.2.3.4", "-acme.com", "acme-.com", "a..com", "acme.c", "acme.123", `${"x".repeat(64)}.com`, `${"a.".repeat(127)}com`, "*.acme.com", "acme_co.com", "localhost", "shop.localhost", "acme.local", "x.vercel.app"]) {
      assert.equal(parseCustomDomain(bad).ok, false, `accepted "${bad}"`);
    }
  });
  await check("normalises scheme, path, port, case and IDN", async () => {
    assert.deepEqual(parseCustomDomain("https://Shop.Acme.com/path?x=1"), { ok: true, host: "shop.acme.com" });
    assert.deepEqual(parseCustomDomain("acme.com:8443"), { ok: true, host: "acme.com" });
    assert.deepEqual(parseCustomDomain("www.acme.com."), { ok: true, host: "www.acme.com" });
    assert.deepEqual(parseCustomDomain("münchen.de"), { ok: true, host: "xn--mnchen-3ya.de" });
  });
  await check("rejects the platform root domain and anything under it", async () => {
    assert.equal(parseCustomDomain("demo.test").ok, false);
    assert.equal(parseCustomDomain("alpha.demo.test").ok, false);
    assert.equal(parseCustomDomain("www.beta.demo.test").ok, false);
    const res = await asA(() => addCustomDomain("gamma.demo.test"));
    assert.equal(res.ok, false);
  });

  console.log("Adding");
  await check("add creates a pending custom record attached at the provider", async () => {
    const res = await asA(() => addCustomDomain("WWW.Alpha-Shop.com"));
    assert.ok(res.ok, !res.ok ? res.error : "");
    const d = await domains.findOne({ _id: "www.alpha-shop.com" });
    assert.equal(d?.companyId, A);
    assert.equal(d?.status, "pending");
    assert.equal(d?.kind, "custom");
    assert.equal(d?.isPrimary, false);
    assert.match(d?.verificationToken ?? "", /^[0-9a-f]{32}$/);
    assert.equal((d as unknown as { provider?: { id: string; attached: boolean } }).provider?.id, "manual");
    const view = res.domains.find((x) => x.host === "www.alpha-shop.com")!;
    assert.deepEqual(view.records.map((r) => r.type), ["TXT", "CNAME"]);
    assert.equal(view.records[0].name, "_selfrun-verify.www.alpha-shop.com");
    assert.equal(view.records[0].value, `demo-verify=${d?.verificationToken}`);
    assert.equal(view.records[1].value, "cname.vercel-dns.com");
  });
  await check("apex domains get the A record fallback", async () => {
    const res = await asB(() => addCustomDomain("beta-apex.com"));
    assert.ok(res.ok);
    const view = res.domains.find((x) => x.host === "beta-apex.com")!;
    assert.deepEqual(view.records[1], { type: "A", name: "@", value: "76.76.21.21", reason: "Points the domain at the hosting platform", state: "unknown" });
  });
  await check("a pending domain doesn't route yet", async () => {
    forgetCompanyRouting();
    assert.equal(await resolveCompanyIdByHost("www.alpha-shop.com"), null);
  });
  await check("the same company adding it twice is told so", async () => {
    const res = await asA(() => addCustomDomain("www.alpha-shop.com"));
    assert.equal(res.ok, false);
    assert.match(!res.ok ? res.error : "", /already added/);
  });
  await check("another company can't take it (or its www counterpart), without learning who has it", async () => {
    for (const host of ["www.alpha-shop.com", "alpha-shop.com"]) {
      const res = await asB(() => addCustomDomain(host));
      assert.equal(res.ok, false);
      assert.equal(!res.ok && res.error, "That domain is already connected to a workspace.");
      assert.ok(!(!res.ok && res.error.includes("Alpha")));
    }
  });
  await check(`cap of ${MAX_CUSTOM_DOMAINS} custom domains per company`, async () => {
    for (let i = 2; i <= MAX_CUSTOM_DOMAINS; i++) assert.ok((await asA(() => addCustomDomain(`d${i}.alpha-shop.com`))).ok, `domain ${i}`);
    const res = await asA(() => addCustomDomain("one-too-many.com"));
    assert.equal(res.ok, false);
    assert.match(!res.ok ? res.error : "", /up to 10/);
    // The other company isn't affected by A's count.
    assert.ok((await asB(() => addCustomDomain("www.beta-shop.com"))).ok);
  });
  await check("a stale unverified claim by another company can be taken over", async () => {
    await domains.updateOne({ _id: "d10.alpha-shop.com" }, { $set: { createdAt: new Date(Date.now() - 8 * 86400_000) } });
    const res = await asB(() => addCustomDomain("d10.alpha-shop.com"));
    assert.ok(res.ok, !res.ok ? res.error : "");
    assert.equal((await domains.findOne({ _id: "d10.alpha-shop.com" }))?.companyId, B);
  });

  console.log("Verifying");
  await check("the manual provider never counts as ownership proof; missing TXT stays pending", async () => {
    const res = await asA(() => verifyCustomDomain("www.alpha-shop.com", notFound));
    assert.equal(res.ok, false);
    const d = await domains.findOne({ _id: "www.alpha-shop.com" });
    assert.equal(d?.status, "pending");
    const view = (await asA(() => listCompanyDomains())).find((x) => x.host === "www.alpha-shop.com")!;
    assert.equal(view.records[0].state, "missing");
  });
  await check("a TXT record with the wrong value is reported as a mismatch", async () => {
    const res = await asA(() => verifyCustomDomain("www.alpha-shop.com", txtFor("www.alpha-shop.com", "demo-verify=nope")));
    assert.equal(res.ok, false);
    assert.match(!res.ok ? res.error : "", /doesn't match/);
    const view = (await asA(() => listCompanyDomains())).find((x) => x.host === "www.alpha-shop.com")!;
    assert.equal(view.records[0].state, "mismatch");
  });
  await check("other DNS errors are reported without verifying", async () => {
    const res = await asA(() => verifyCustomDomain("www.alpha-shop.com", async () => Promise.reject(Object.assign(new Error("x"), { code: "ETIMEOUT" }))));
    assert.equal(res.ok, false);
    assert.match(!res.ok ? res.error : "", /ETIMEOUT/);
  });
  await check("another company can't verify it", async () => {
    const res = await asB(() => verifyCustomDomain("www.alpha-shop.com", txtFor("www.alpha-shop.com", `demo-verify=${"x"}`)));
    assert.equal(res.ok, false);
  });
  await check("the right TXT record (split into chunks) verifies it and it routes", async () => {
    const host = "www.alpha-shop.com";
    const res = await asA(async () => verifyCustomDomain(host, txtFor(host, `demo-verify=${await token(host)}`)));
    assert.ok(res.ok, !res.ok ? res.error : "");
    const d = await domains.findOne({ _id: host });
    assert.equal(d?.status, "verified");
    assert.equal(await resolveCompanyIdByHost(host), A);
    // The TXT record no longer needs showing; manual hosting → SSL managed by the platform.
    const view = res.domains.find((x) => x.host === host)!;
    assert.equal(view.records.length, 0);
    assert.equal(view.hosting.ssl, "manual");
  });

  console.log("Primary");
  await check("a pending domain can't be primary", async () => {
    const res = await asA(() => setPrimaryDomain("d2.alpha-shop.com"));
    assert.equal(res.ok, false);
  });
  await check("making a verified domain primary leaves exactly one primary", async () => {
    const res = await asA(() => setPrimaryDomain("www.alpha-shop.com"));
    assert.ok(res.ok);
    const primaries = await domains.find({ companyId: A, isPrimary: true }).toArray();
    assert.deepEqual(primaries.map((p) => p._id), ["www.alpha-shop.com"]);
    // B's primary untouched.
    assert.equal((await domains.findOne({ _id: "beta.demo.test" }))?.isPrimary, true);
  });
  await check("another company can't make it primary", async () => {
    assert.equal((await asB(() => setPrimaryDomain("www.alpha-shop.com"))).ok, false);
  });
  await check("the list puts the automatic address first", async () => {
    const list = await asA(() => listCompanyDomains());
    assert.equal(list[0].host, "alpha.demo.test");
    assert.equal(list[0].kind, "subdomain");
    assert.equal(list[0].removable, false);
    assert.equal(list[1].host, "www.alpha-shop.com");
    assert.ok(list.every((d) => !d.host.includes("beta")));
  });

  console.log("Removing");
  await check("the automatic subdomain can't be removed", async () => {
    const res = await asA(() => removeCustomDomain("alpha.demo.test"));
    assert.equal(res.ok, false);
    assert.ok(await domains.findOne({ _id: "alpha.demo.test" }));
  });
  await check("another company can't remove it", async () => {
    assert.equal((await asB(() => removeCustomDomain("www.alpha-shop.com"))).ok, false);
    assert.ok(await domains.findOne({ _id: "www.alpha-shop.com" }));
  });
  await check("removing the primary custom domain makes the subdomain primary and stops routing", async () => {
    const res = await asA(() => removeCustomDomain("www.alpha-shop.com"));
    assert.ok(res.ok);
    assert.equal(await domains.findOne({ _id: "www.alpha-shop.com" }), null);
    assert.equal((await domains.findOne({ _id: "alpha.demo.test" }))?.isPrimary, true);
    assert.equal(await domains.countDocuments({ companyId: A, isPrimary: true }), 1);
    assert.equal(await resolveCompanyIdByHost("www.alpha-shop.com"), null);
  });
  await check("a removed domain can be added again (by anyone)", async () => {
    assert.ok((await asB(() => addCustomDomain("www.alpha-shop.com"))).ok);
  });

  console.log("Daily re-check");
  await check("recheckPendingDomains verifies domains whose TXT record appeared", async () => {
    const host = "www.beta-shop.com";
    const expected = `demo-verify=${await token(host)}`;
    const results = await recheckPendingDomains(async (name) => (name === `${VERIFY_LABEL}.${host}` ? [[expected]] : Promise.reject(Object.assign(new Error("none"), { code: "ENODATA" }))));
    const b = results.find((r) => r.companyId === B);
    assert.ok(b?.ok);
    assert.equal(b?.result?.verified, 1);
    assert.equal((await domains.findOne({ _id: host }))?.status, "verified");
    assert.equal((await domains.findOne({ _id: "beta-apex.com" }))?.status, "pending");
  });

  console.log("Vercel provider (mocked API)");
  // A fake Vercel project: "open.com" is verified there without any challenge
  // (no other Vercel account uses it); "contested.com" gets a TXT challenge.
  const solved = new Set<string>();
  const calls: string[] = [];
  const vercelDomain = (host: string) =>
    host === "contested.com" && !solved.has(host)
      ? { name: host, verified: false, verification: [{ type: "TXT", domain: "_vercel.contested.com", value: "vc-domain-verify=contested.com,abc", reason: "pending_domain_verification" }] }
      : { name: host, verified: true };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    const host = decodeURIComponent(url.pathname.split("/domains/")[1]?.split("/")[0] ?? "");
    if (url.pathname.startsWith("/v6/domains/")) return json(200, { misconfigured: true });
    if (method === "POST" && url.pathname.endsWith("/domains")) return json(200, vercelDomain(JSON.parse(String(init?.body)).name));
    if (method === "POST" && url.pathname.endsWith("/verify")) return vercelDomain(host).verified ? json(200, vercelDomain(host)) : json(400, { error: { code: "missing_txt_record" } });
    if (method === "GET") return json(200, vercelDomain(host));
    if (method === "DELETE") return json(200, {});
    return json(404, {});
  }) as typeof fetch;
  process.env.DOMAIN_PROVIDER = "vercel";
  process.env.VERCEL_API_TOKEN = "test-token";
  process.env.VERCEL_PROJECT_ID = "test-project";
  try {
    await check("the provider's own 'verified' is not ownership proof when it never challenged", async () => {
      assert.ok((await asA(() => addCustomDomain("open.com"))).ok);
      const res = await asA(() => verifyCustomDomain("open.com", notFound));
      assert.equal(res.ok, false);
      assert.equal((await domains.findOne({ _id: "open.com" }))?.status, "pending");
    });
    await check("provider challenge + routing records are shown alongside the TXT record", async () => {
      const res = await asA(() => addCustomDomain("contested.com"));
      assert.ok(res.ok);
      const view = res.domains.find((x) => x.host === "contested.com")!;
      assert.deepEqual(
        view.records.map((r) => `${r.type} ${r.name}`),
        ["TXT _selfrun-verify.contested.com", "TXT _vercel.contested.com", "A @"],
      );
      assert.equal((await asA(() => verifyCustomDomain("contested.com", notFound))).ok, false);
    });
    await check("once the provider's challenge is met, that verifies the domain", async () => {
      solved.add("contested.com");
      const res = await asA(() => verifyCustomDomain("contested.com", notFound));
      assert.ok(res.ok, !res.ok ? res.error : "");
      assert.equal((await domains.findOne({ _id: "contested.com" }))?.status, "verified");
      const view = res.domains.find((x) => x.host === "contested.com")!;
      // Ownership done, DNS still pointing elsewhere: SSL waits, only the routing record remains.
      assert.equal(view.hosting.ssl, "pending");
      assert.deepEqual(view.records.map((r) => r.type), ["A"]);
    });
    await check("removing detaches the host at the provider", async () => {
      assert.ok((await asA(() => removeCustomDomain("contested.com"))).ok);
      assert.ok(calls.includes("DELETE /v9/projects/test-project/domains/contested.com"));
    });
  } finally {
    globalThis.fetch = realFetch;
    process.env.DOMAIN_PROVIDER = "manual";
  }
}

main()
  .catch((err) => {
    console.error(err);
    failures.push("(crashed)");
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failures.length} failed`);
    process.exit(failures.length ? 1 : 0);
  });
