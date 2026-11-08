/**
 * Checks `companySiteUrl()` (src/lib/platform/tenancy/site-url.ts) — each
 * company's public site origin — against a throwaway LOCAL database that is
 * dropped at the end. Refuses to run against anything but a local server.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27017/siteurl_test_$(date +%s) PLATFORM_ROOT_DOMAIN=example.com \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-site-url.ts
 */

import assert from "node:assert/strict";
import { getPlatformDb, clientPromise } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { COMPANIES_COLLECTION, COMPANY_DOMAINS_COLLECTION, forgetCompanyRouting, type Company, type CompanyDomain } from "@/lib/platform/tenancy/companies";
import { companySiteHost, companySiteUrl, forgetCompanySiteUrls } from "@/lib/platform/tenancy/site-url";
import { siteUrl } from "@/lib/seo";
import { defaultRobots } from "@/lib/products/rankmax-ai/robots-store";
import { robotsTxtTemplate } from "@/lib/products/rankmax-ai/robots-parse";
import { getSettings } from "@/lib/products/rankmax-ai/settings";

const uri = process.env.MONGODB_URI ?? "";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[\w-]*test[\w-]*$/i.test(uri)) {
  console.error("Refusing to run: MONGODB_URI must be a local throwaway database whose name contains 'test'.");
  process.exit(1);
}
if (process.env.PLATFORM_ROOT_DOMAIN !== "example.com") {
  console.error("Run with PLATFORM_ROOT_DOMAIN=example.com.");
  process.exit(1);
}

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

const now = new Date();
const company = (id: string, slug: string, isPlatformOwner = false): Company => ({ _id: id, slug, name: slug, status: "active", isPlatformOwner, createdAt: now, updatedAt: now });
const domain = (host: string, companyId: string, d: Partial<CompanyDomain>): CompanyDomain => ({
  _id: host,
  companyId,
  status: "verified",
  verificationToken: "t",
  isPrimary: false,
  kind: "custom",
  createdAt: now,
  verifiedAt: now,
  ...d,
});

async function seed() {
  const db = await getPlatformDb();
  await db.collection<Company>(COMPANIES_COLLECTION).insertMany([
    company("owner", "demo", true),
    company("acme", "acme"),
    company("beta", "beta"),
    company("gamma", "gamma"),
  ]);
  await db.collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION).insertMany([
    // Platform owner: example.com primary, www alias, plus its automatic subdomain.
    domain("example.com", "owner", { isPrimary: true }),
    domain("www.example.com", "owner", {}),
    domain("demo.example.com", "owner", { kind: "subdomain" }),
    // Only the automatic subdomain.
    domain("acme.example.com", "acme", { kind: "subdomain", isPrimary: true }),
    // A verified custom domain that has been made primary.
    domain("beta.example.com", "beta", { kind: "subdomain" }),
    domain("www.beta-shop.com", "beta", { isPrimary: true }),
    domain("beta-old.com", "beta", {}),
    // A custom domain still pending verification (even flagged primary) must be ignored.
    domain("gamma.example.com", "gamma", { kind: "subdomain" }),
    domain("gamma.io", "gamma", { status: "pending", isPrimary: true, verifiedAt: null }),
  ]);
}

async function run() {
  await seed();
  const as = <T>(id: string, fn: () => Promise<T>) => runAsCompany(id, fn);

  console.log("companySiteUrl()");
  await check("platform owner === siteUrl exactly", async () => {
    assert.equal(await as("owner", companySiteUrl), siteUrl);
    assert.equal(await as("owner", companySiteUrl), "https://example.com");
    assert.equal(await as("owner", companySiteHost), "example.com");
  });
  await check("company with only its subdomain → https://<slug>.<root>", async () => {
    assert.equal(await as("acme", companySiteUrl), "https://acme.example.com");
    assert.equal(await as("acme", companySiteHost), "acme.example.com");
  });
  await check("verified primary custom domain wins over the subdomain", async () => {
    assert.equal(await as("beta", companySiteUrl), "https://www.beta-shop.com");
  });
  await check("pending custom domain is ignored (falls back to the subdomain)", async () => {
    assert.equal(await as("gamma", companySiteUrl), "https://gamma.example.com");
  });
  await check("companies interleaved in one async flow never share a result", async () => {
    const got = await Promise.all(["owner", "acme", "beta", "gamma", "acme"].map((id) => as(id, companySiteUrl)));
    assert.deepEqual(got, ["https://example.com", "https://acme.example.com", "https://www.beta-shop.com", "https://gamma.example.com", "https://acme.example.com"]);
  });
  await check("no company context → throws (never a default company)", async () => {
    await assert.rejects(() => companySiteUrl());
  });

  const db = await getPlatformDb();
  const domains = db.collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION);
  await check("owner with no verified custom primary keeps siteUrl", async () => {
    await domains.updateOne({ _id: "example.com" }, { $set: { isPrimary: false } });
    await domains.updateOne({ _id: "demo.example.com" }, { $set: { isPrimary: true } });
    forgetCompanySiteUrls();
    assert.equal(await as("owner", companySiteUrl), siteUrl);
    await domains.updateOne({ _id: "example.com" }, { $set: { isPrimary: true } });
    await domains.updateOne({ _id: "demo.example.com" }, { $set: { isPrimary: false } });
    forgetCompanySiteUrls();
  });
  await check("primary change applies after forgetCompanySiteUrls()", async () => {
    await domains.updateOne({ _id: "www.beta-shop.com" }, { $set: { isPrimary: false } });
    await domains.updateOne({ _id: "beta-old.com" }, { $set: { isPrimary: true } });
    forgetCompanySiteUrls();
    assert.equal(await as("beta", companySiteUrl), "https://beta-old.com");
  });
  await check("local development: *.localhost subdomain keeps http + port", async () => {
    const saved = { root: process.env.PLATFORM_ROOT_DOMAIN, port: process.env.PORT };
    try {
      process.env.PLATFORM_ROOT_DOMAIN = "";
      process.env.PORT = "3100";
      await db.collection<Company>(COMPANIES_COLLECTION).insertOne(company("delta", "delta"));
      await domains.insertOne(domain("delta.localhost", "delta", { kind: "subdomain", isPrimary: true }));
      forgetCompanySiteUrls();
      assert.equal(await as("delta", companySiteUrl), "http://delta.localhost:3100");
      assert.equal(await as("acme", companySiteUrl), "http://acme.localhost:3100", "subdomain record for another root → the dev address");
      assert.equal(await as("owner", companySiteUrl), siteUrl);
    } finally {
      process.env.PLATFORM_ROOT_DOMAIN = saved.root;
      if (saved.port === undefined) delete process.env.PORT;
      else process.env.PORT = saved.port;
      forgetCompanySiteUrls();
    }
  });

  console.log("Consumers");
  await check("robots.txt default: owner byte-for-byte unchanged, others point at their own sitemap", async () => {
    // Every company, the owner included, points at its own site's sitemap (no owner-specific constant any more).
    assert.equal(await as("owner", defaultRobots), robotsTxtTemplate(siteUrl));
    assert.ok(robotsTxtTemplate(siteUrl).includes(`Sitemap: ${siteUrl}/sitemap.xml\n`));
    const acme = await as("acme", defaultRobots);
    assert.ok(acme.endsWith("\nSitemap: https://acme.example.com/sitemap.xml\n"), acme);
  });
  await check("SEO settings defaults: owner keeps its own, others audit their own site with nothing scheduled", async () => {
    const owner = await as("owner", getSettings);
    assert.equal(owner.siteOrigin, siteUrl);
    assert.equal(owner.integrations.gsc.property, "sc-domain:example.com");
    assert.equal(owner.schedule.auditFrequency, "weekly");
    const acme = await as("acme", getSettings);
    assert.equal(acme.siteOrigin, "https://acme.example.com");
    assert.equal(acme.integrations.gsc.property, "");
    assert.deepEqual(acme.schedule, { auditFrequency: "off", syncSearchData: false, verifyBacklinks: false });
  });
}

(async () => {
  forgetCompanyRouting();
  try {
    await run();
  } finally {
    const db = await getPlatformDb();
    await db.dropDatabase();
    await (await clientPromise).close();
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
