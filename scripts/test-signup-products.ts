/**
 * Signing up for products: one, several or all of them, the website choice, the plan each starts on, the first screen
 * and the company's address(es): two (website + app) with a website from us, otherwise one. Throwaway database only; e-mail goes to the console and AI is faked.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getCompany, resolveHostInfo } from "@/lib/platform/tenancy/companies";
import { surfaceRedirect } from "@/lib/platform/tenancy/surfaces";
import { appUrlForCompany, siteUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { buildTargets } from "@/lib/platform/domains/sync/engine";
import { listDomainsForCompany } from "@/lib/platform/domains/overview";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { hasSeparateAppHost } from "@/lib/platform/products/selection";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { approveSignup, consumeHandoff, listAwaitingApproval, startSignup, validateSignup, type SignupInput } from "@/lib/platform/signup";
import { setSignupMode } from "@/lib/platform/settings";
import { setPanelActive } from "@/lib/platform/panels/store";
import { sampleBusinessInput } from "@/lib/platform/business-taxonomy";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import { allProductsTrialPlan } from "@/lib/platform/billing/signup-plan";
import { signupProductHref } from "@/lib/platform/billing/signup-plan-rule";
import { getDb } from "@/lib/mongodb";
import { setOpenAIForTests } from "@/lib/openai";

const noAi = async () => { throw new Error("fake AI provider"); };
setOpenAIForTests({ responses: { create: noAi }, chat: { completions: { create: noAi } } } as never);

let checks = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); checks++; };
const eq = <T>(a: T, b: T, m: string) => { assert.deepEqual(a, b, m); checks++; };

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  await db.dropDatabase();
  process.env.EMAIL_PROVIDER = "console";
  process.env.PLATFORM_ROOT_DOMAIN = "localhost";
  process.env.PLATFORM_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const sent: string[] = [];
  const log = console.log;
  console.log = (...a: unknown[]) => { const l = a.map(String).join(" "); if (l.includes("[email:console]")) sent.push(l); else log(...a); };
  await setSignupMode("open", "test");

  let n = 0;
  const form = (slug: string, extra: Partial<SignupInput> = {}): SignupInput => ({ companyName: `${slug} Co`, slug, name: "Owner", email: `o@${slug}.test`, password: "correct-horse-battery", businessCategories: sampleBusinessInput().categories, businessSubCategories: sampleBusinessInput().subCategories, acceptTerms: true, ...extra });
  const signUp = async (slug: string, extra: Partial<SignupInput> = {}) => {
    const r = await startSignup(form(slug, extra), { hostHint: "localhost:3000", clientKey: `k${++n}` });
    assert.ok(r.ok && r.kind === "created", `${slug}: ${JSON.stringify(r)}`);
    const company = (await db.collection<{ _id: string; slug: string }>("companies").findOne({ slug }))!;
    const url = new URL(r.redirectTo);
    const handoff = await consumeHandoff(url.searchParams.get("token")!, company._id);
    const c = (await getCompany(company._id))!;
    const pages = await runAsCompany(c._id, async () => (await getDb()).collection("cms_pages").countDocuments());
    return { host: url.host, company: c, next: handoff!.next, sub: (await getCompanySubscription(c._id))!, pages };
  };

  // --- the form's rules ------------------------------------------------------------
  ok(!validateSignup(form("rules")).product, "older callers need not name a product");
  ok(validateSignup(form("rules", { product: "" })).product, "the form must choose");
  ok(validateSignup(form("rules", { product: "nothing" })).product, "unknown product");
  ok(validateSignup(form("rules", { product: "portal" })).product, "ClientOS is not sold alone");
  ok(validateSignup(form("rules", { product: "core" })).product, "CommandOS is not a choice");
  ok(validateSignup(form("rules", { product: "all", websiteMode: "external", websiteUrl: "example" })).websiteUrl, "own website needs its address");
  eq(validateSignup(form("rules", { product: "all", websiteMode: "external", websiteUrl: "https://example.com" })), {}, "valid");

  // --- one product -------------------------------------------------------------------
  const hr = await signUp("onlyhr", { product: "hrms", websiteMode: "platform" });
  eq(hr.company.products, { mode: "selected", keys: ["hrms"] }, "only the product chosen");
  eq(hr.company.website?.mode, "none", "no website for a product without one");
  eq(hr.pages, 0, "no website pages written");
  eq([hr.sub.planId, hr.sub.status], ["free", "active"], "one product starts on Free");
  ok(hr.next.startsWith("/") && hr.next !== "/commandos", `opens the product: ${hr.next}`);

  const site = await signUp("onlysite", { product: "cms" });
  eq([site.company.website?.mode, site.sub.planId], ["platform", "free"], "SiteCraft gets its website");
  ok(site.pages > 0, "starter website written");
  const drafts = await runAsCompany(site.company._id, async () => (await getDb()).collection("cms_pages").countDocuments({ version: { $in: [null, ""] } }));
  eq(drafts, 0, "every starter page is published");

  // --- several products ----------------------------------------------------------------
  const two = await signUp("twoof", { product: ["hrms", "fms", "intelligence"] });
  eq(two.company.products?.mode === "selected" && [...two.company.products.keys].sort(), ["fms", "hrms"], "every product picked; DataBrain comes anyway");
  eq([two.sub.status, two.next], ["trialing", "/commandos"], "more than one product: paid trial, CommandOS");
  const free2 = await signUp("freepair", { product: ["hrms", "messenger"] });
  eq(free2.sub.status, "trialing", "Huddle counts as a second product");
  const withSite = await signUp("sitepair", { product: ["hrms", "cms"] });
  ok(withSite.company.website?.mode === "platform" && withSite.pages > 0, "website picked among several: written");
  ok(validateSignup(form("rules", { product: [] })).product, "nothing picked");
  ok(validateSignup(form("rules", { product: ["all", "hrms"] })).product, "All stands alone");
  ok(validateSignup(form("rules", { product: ["intelligence"] })).product, "DataBrain is not a choice");
  eq(signupProductHref("intelligence"), "/signup", "it comes with anything");
  eq(signupProductHref("seo"), signupProductHref("cms"), "RankMax comes with SiteCraft");

  // --- all products --------------------------------------------------------------------
  const trial = (await allProductsTrialPlan())!;
  ok(trial && trial.planId !== "free" && trial.trialDays > 0, "there is a paid plan to try");
  const all = await signUp("takeall", { product: "all", websiteMode: "external", websiteUrl: "https://takeall.example.com" });
  eq(all.company.products?.mode, "all", "all");
  eq(all.company.website, { mode: "external", externalUrl: "https://takeall.example.com" }, "keeps their website");
  eq([all.sub.planId, all.sub.status], [trial.planId, "trialing"], "All starts a paid trial");
  eq([all.next, all.pages], ["/commandos", 0], "CommandOS, no website written");

  const none = await signUp("nosite", { product: "all", websiteMode: "none" });
  eq([none.company.website?.mode, none.pages], ["none", 0], "no website");
  const ours = await signUp("oursite", { product: "all", websiteMode: "platform" });
  ok(ours.company.website?.mode === "platform" && ours.pages > 0, "our website");

  const old = await signUp("oldform");
  eq([old.company.products, old.sub.planId], [undefined, "free"], "no product field: as before");

  // --- one address, or two -------------------------------------------------------------
  const at = (host: string) => resolveHostInfo(host);
  eq(hr.host, "onlyhr.localhost:3000", "no website: signed in on the one address");
  eq(none.host, "nosite.localhost:3000", "All without a website: one address");
  eq(all.host, "takeall.localhost:3000", "own website elsewhere: one address");
  eq(site.host, "onlysite-app.localhost:3000", "website: the app has its own address");
  eq(old.host, "oldform-app.localhost:3000", "companies as before keep two");
  const oneSite = await at("onlyhr.localhost");
  eq([oneSite?.companyId, oneSite?.surface, oneSite?.single, Boolean(oneSite?.retired)], [hr.company._id, "app", true, false], "the one address serves the app");
  ok((await at("onlyhr-app.localhost"))?.retired, "-app of a one-address company only forwards");
  eq([(await at("onlysite.localhost"))?.surface, (await at("onlysite-app.localhost"))?.surface], ["site", "app"], "two sides with a website");
  eq([surfaceRedirect("app", "/", true), surfaceRedirect("app", "/careers", true), surfaceRedirect("app", "/commandos", true)], ["app-home", null, null], "nothing is sent to another host");
  eq(await appUrlForCompany(hr.company._id, "localhost:3000"), "http://onlyhr.localhost:3000", "e-mail links use it");
  eq(await siteUrlForCompany(hr.company._id, "localhost:3000"), "http://onlyhr.localhost:3000", "public links too");
  const ctx = { root: "example.in", appSuffix: "-app", isPlatformHost: () => false };
  const targets = (single: boolean) => buildTargets({ _id: "x", slug: "acme", singleHost: single }, [{ _id: "acme.com", kind: "custom" as const }], ctx).map((t) => t.host).sort();
  eq(targets(true), ["acme.com", "acme.example.in", "www.acme.com"], "hosting gets no app addresses");
  ok(targets(false).includes("acme-app.example.in") && targets(false).includes("app.acme.com"), "with a website it does");

  await db.collection("company_domains").insertOne({ _id: "work.onlyhr.test" as never, companyId: hr.company._id, kind: "custom", status: "verified", isPrimary: true, verificationToken: "t", createdAt: new Date(), verifiedAt: new Date() });
  await db.collection("company_domains").updateMany({ companyId: hr.company._id, kind: "subdomain" }, { $set: { isPrimary: false } });
  eq(await appUrlForCompany(hr.company._id), "https://work.onlyhr.test", "own domain serves the app itself");
  ok((await listDomainsForCompany(hr.company._id)).every((d) => !d.app), "no app. records asked for");

  // Taking the website later gives the second address; dropping it goes back to one.
  ok((await setCompanyProducts(hr.company._id, { products: ["hrms", "cms"] }, { id: "t" })).ok, "SiteCraft added");
  ok(hasSeparateAppHost((await getCompany(hr.company._id))!), "now two");
  eq([(await at("onlyhr.localhost"))?.surface, (await at("onlyhr-app.localhost"))?.surface], ["site", "app"], "routing follows at once");
  eq(await appUrlForCompany(hr.company._id), "https://app.work.onlyhr.test", "app moves to app.<domain>");
  ok((await setCompanyProducts(hr.company._id, { products: ["hrms"] }, { id: "t" })).ok, "SiteCraft removed");
  ok((await at("onlyhr.localhost"))?.single, "one again");

  // --- a product switched off, and approval --------------------------------------------
  await setPanelActive("fms", false);
  const off = await startSignup(form("offsale", { product: "fms" }), { hostHint: "localhost:3000", clientKey: "off" });
  ok(!off.ok && off.errors.product, "a product switched off can't be signed up for");
  await setPanelActive("fms", true);

  await setSignupMode("approval", "test");
  const wait = await startSignup(form("waits", { product: "pms" }), { hostHint: "localhost:3000", clientKey: "w" });
  ok(wait.ok && wait.kind === "awaiting_approval", "waits");
  const queued = (await listAwaitingApproval()).find((r) => r.slug === "waits")!;
  ok(queued.products && queued.products !== "All products", `queue shows the product: ${queued.products}`);
  const approved = await approveSignup(queued.id, { hostHint: "localhost:3000" });
  assert.ok(approved.ok, JSON.stringify(approved));
  eq((await getCompany(approved.companyId))!.products, { mode: "selected", keys: ["pms"] }, "approval keeps the choice");
  ok(sent.some((m) => m.includes("o@waits.test")), "owner e-mailed");

  // --- links from product pages ----------------------------------------------------------
  ok(/^\/signup\?product=./.test(signupProductHref("hrms")), "product page preselects");
  eq(signupProductHref("portal"), signupProductHref("cms"), "ClientOS comes with SiteCraft");
  eq(signupProductHref("workspace"), "/signup", "CommandOS: no preselect");

  console.log = log;
  console.log(`signup-products: ${checks} checks passed`);
  await db.dropDatabase();
  await (await clientPromise).close();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); process.exit(1); });
