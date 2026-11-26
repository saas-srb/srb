/**
 * A company's own domains and subdomains: using a subdomain beside a website that runs elsewhere (or beside ours), the
 * DNS records asked for (including .co.in), what is attached at the hosting provider, routing, links, and that no
 * address takes another one over. Throwaway database; the manual domain provider, no network.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { forgetCompanyRouting, resolveHostInfo } from "@/lib/platform/tenancy/companies";
import { appUrlForCompany, forgetCompanySiteUrls, siteUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { surfaceRedirect } from "@/lib/platform/tenancy/surfaces";
import { addCustomDomain, parseCustomDomain, removeCustomDomain, setPrimaryDomain, verifyCustomDomain, VERIFY_LABEL, type DomainUse } from "@/lib/platform/domains/custom";
import { routingRecord } from "@/lib/platform/domains/vercel";
import { isDomainEnding, isWebsiteAddress, relativeName, zoneOf } from "@/lib/platform/domains/zone";
import { buildTargets } from "@/lib/platform/domains/sync/engine";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { listPlans } from "@/lib/platform/billing/plans";
import type { CompanyWebsite, ProductSelection } from "@/lib/platform/products/selection";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

let checks = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); checks++; };
const eq = <T>(a: T, b: T, m: string) => { assert.deepEqual(a, b, m); checks++; };

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  await db.dropDatabase();
  process.env.PLATFORM_ROOT_DOMAIN = "base.test.in";
  process.env.DOMAIN_PROVIDER = "manual";
  process.env.EMAIL_PROVIDER = "console";

  // --- reading hosts ------------------------------------------------------------------
  eq([zoneOf("app.acme.com"), zoneOf("acme.co.in"), zoneOf("hr.team.acme.co.in"), zoneOf("acme.in")], ["acme.com", "acme.co.in", "acme.co.in", "acme.in"], "registered domain");
  eq([relativeName("hr.acme.co.in"), relativeName("acme.co.in"), relativeName("a.b.acme.com")], ["hr", "@", "a.b"], "name typed in a DNS panel");
  eq(["acme.com", "www.acme.co.in", "app.acme.com"].map(isWebsiteAddress), [true, true, false], "website addresses");
  ok(isDomainEnding("co.in") && !isDomainEnding("acme.in"), "endings");
  eq([routingRecord("acme.co.in").type, routingRecord("acme.co.in").name], ["A", "@"], ".co.in domain gets an A record");
  eq([routingRecord("app.acme.co.in").type, routingRecord("app.acme.co.in").name], ["CNAME", "app"], "its subdomain a CNAME");
  ok(!parseCustomDomain("app.acme.com").ok && parseCustomDomain("app.acme.com", "app").ok, "app. is a sign-in address, not a website domain");
  ok(!parseCustomDomain("co.in", "app").ok, "an ending can't be added");

  // --- companies ------------------------------------------------------------------------
  await listPlans();
  await db.collection("billing_plans").updateMany({}, { $set: { "limits.customDomains": 20 } });
  const company = async (slug: string, products?: ProductSelection, website?: CompanyWebsite) => {
    const id = randomUUID();
    const now = new Date();
    await db.collection("companies").insertOne({ _id: id as never, slug, name: slug, status: "active", isPlatformOwner: false, ...(products ? { products, website } : {}), createdAt: now, updatedAt: now });
    await db.collection("company_domains").insertOne({ _id: `${slug}.base.test.in` as never, companyId: id, status: "verified", isPrimary: true, kind: "subdomain", verificationToken: "t", createdAt: now, verifiedAt: now });
    return id;
  };
  const add = (id: string, host: string, use?: DomainUse) => runAsCompany(id, () => addCustomDomain(host, use));
  const verify = (id: string, host: string) =>
    runAsCompany(id, async () => {
      const token = (await db.collection<{ _id: string; verificationToken: string }>("company_domains").findOne({ _id: host }))!.verificationToken;
      return verifyCustomDomain(host, async (name) => (name === `${VERIFY_LABEL}.${host}` ? [[`domain-verify=${token}`]] : []));
    });
  const at = async (host: string) => { forgetCompanyRouting(); return resolveHostInfo(host); };
  const urls = async (id: string) => { forgetCompanySiteUrls(); return [await appUrlForCompany(id), await siteUrlForCompany(id)]; };
  const view = (r: Awaited<ReturnType<typeof add>>, host: string) => { assert.ok(r.ok, r.ok ? "" : r.error); return r.domains.find((d) => d.host === host)!; };

  // 1. Website elsewhere, software here: a subdomain of their domain.
  const ext = await company("extco", { mode: "selected", keys: ["hrms"] }, { mode: "external", externalUrl: "https://www.extco.co.in" });
  for (const theirs of ["extco.co.in", "www.extco.co.in"]) {
    const r = await add(ext, theirs);
    ok(!r.ok && /subdomain/.test(r.error), `${theirs}: their website is never taken over`);
  }
  const v = view(await add(ext, "app.extco.co.in"), "app.extco.co.in");
  eq([v.app, v.records.map((r) => `${r.type} ${r.name}`)], [null, ["TXT _domain-verify.app.extco.co.in", "CNAME app"]], "only its own two records");
  ok((await verify(ext, "app.extco.co.in")).ok, "verified");
  const i = await at("app.extco.co.in");
  eq([i?.companyId, i?.surface, i?.single], [ext, "app", true], "serves the app");
  eq(await at("app.app.extco.co.in"), null, "nothing under it");
  eq(await at("www.extco.co.in"), null, "their website host is not ours");
  ok((await runAsCompany(ext, () => setPrimaryDomain("app.extco.co.in"))).ok, "make primary");
  eq(await urls(ext), ["https://app.extco.co.in", "https://app.extco.co.in"], "e-mails and public links use it");
  ok(view(await add(ext, "hr.extco.co.in"), "hr.extco.co.in"), "a second subdomain");

  // 2. Our website, plus a sign-in subdomain of their own domain.
  const ours = await company("oursco");
  view(await add(ours, "www.oursco.com"), "www.oursco.com");
  ok((await verify(ours, "www.oursco.com")).ok, "website domain");
  ok((await runAsCompany(ours, () => setPrimaryDomain("www.oursco.com"))).ok, "primary");
  eq(await urls(ours), ["https://app.oursco.com", "https://www.oursco.com"], "as before");
  const t = view(await add(ours, "team.oursco.com", "app"), "team.oursco.com");
  eq([t.appOnly, t.app], [true, null], "sign-in only");
  ok((await verify(ours, "team.oursco.com")).ok, "verified");
  const ti = await at("team.oursco.com");
  eq([ti?.surface, Boolean(ti?.single), ti?.websiteHost], ["app", false, "www.oursco.com"], "app only, website elsewhere on ours");
  eq([(await at("www.oursco.com"))?.surface, (await at("app.oursco.com"))?.surface], ["site", "app"], "the website domain is unchanged");
  eq(await urls(ours), ["https://team.oursco.com", "https://www.oursco.com"], "links: sign-in on the subdomain, website on the domain");
  const pri = await runAsCompany(ours, () => setPrimaryDomain("team.oursco.com"));
  ok(!pri.ok && /sign-in/.test(pri.error), "a sign-in address is never the website domain");
  const call = async (host: string, path: string) => (await proxy(new NextRequest(`http://${host}${path}`, { headers: { host, "sec-fetch-mode": "navigate", accept: "text/html", "accept-language": "en-IN", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" } }))).headers.get("location") ?? "";
  eq(await call("team.oursco.com", "/about"), "http://www.oursco.com/about", "website pages go to the website");
  eq(await call("team.oursco.com", "/"), "http://team.oursco.com/commandos", "its root opens the app");
  eq(await call("team.oursco.com", "/commandos"), "", "products are served there");
  eq(surfaceRedirect("app", "/commandos"), null, "no loop");

  // 3. `app.<domain>` added on its own beside the website domain: removing one leaves the other working.
  view(await add(ours, "app.oursco.com", "app"), "app.oursco.com");
  ok((await verify(ours, "app.oursco.com")).ok, "same company");
  const targets = buildTargets({ _id: ours, slug: "oursco" }, [{ _id: "oursco.com", kind: "custom" }, { _id: "app.oursco.com", kind: "custom", use: "app" }, { _id: "team.oursco.com", kind: "custom", use: "app" }], { root: "base.test.in", appSuffix: "-app", isPlatformHost: () => false }).map((x) => x.host);
  eq(targets.filter((h) => h.endsWith("oursco.com")).sort(), ["app.oursco.com", "oursco.com", "team.oursco.com", "www.oursco.com"], "hosting: no app.app., no www. for subdomains, nothing twice");
  ok((await runAsCompany(ours, () => removeCustomDomain("app.oursco.com"))).ok, "remove the explicit one");
  eq((await at("app.oursco.com"))?.surface, "app", "the website domain's app address still works");

  // 4. Nobody takes another business's address.
  const other = await company("otherco", { mode: "selected", keys: ["fms"] }, { mode: "none" });
  const steal = await add(other, "app.oursco.com");
  ok(!steal.ok, "another business's app address");
  ok(!(await add(other, "team.oursco.com")).ok, "a connected subdomain");
  view(await add(other, "app.otherco.com"), "app.otherco.com");
  ok((await verify(other, "app.otherco.com")).ok, "own subdomain");
  const web = await add(ours, "otherco.com", "website");
  ok(!web.ok && /app\.otherco\.com/.test(web.error), "a website domain whose app address is someone else's");

  // 5. A one-address company that later takes the website keeps its sign-in subdomain for sign-in.
  ok((await setCompanyProducts(other, { products: ["fms", "cms"] }, { id: "t" })).ok, "website added");
  const moved = await at("app.otherco.com");
  eq([moved?.surface, moved?.websiteHost], ["app", "otherco.base.test.in"], "still sign-in; website on the automatic address");
  eq(await urls(other), ["https://app.otherco.com", "https://otherco.base.test.in"], "links follow");

  console.log(`subdomains: ${checks} checks passed`);
  await db.dropDatabase();
  await (await clientPromise).close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
