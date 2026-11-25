/**
 * Signing up for products: one product or all of them, the website choice, the plan each starts on and the first
 * screen. Throwaway database only; e-mail goes to the console and AI is faked.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getCompany } from "@/lib/platform/tenancy/companies";
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
    const handoff = await consumeHandoff(new URL(r.redirectTo).searchParams.get("token")!, company._id);
    const c = (await getCompany(company._id))!;
    const pages = await runAsCompany(c._id, async () => (await getDb()).collection("cms_pages").countDocuments());
    return { company: c, next: handoff!.next, sub: (await getCompanySubscription(c._id))!, pages };
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
  eq(signupProductHref("portal"), "/signup?product=all", "ClientOS means All");
  eq(signupProductHref("workspace"), "/signup", "CommandOS: no preselect");

  console.log = log;
  console.log(`signup-products: ${checks} checks passed`);
  await db.dropDatabase();
  await (await clientPromise).close();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); process.exit(1); });
