/**
 * A company with some products can open only those: URL rules over every real page and API, the proxy itself,
 * the page guard, scheduled jobs and the assistant. Runs against a throwaway database that is dropped at the end.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { listPlans } from "@/lib/platform/billing/plans";
import { updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { companyAppSubdomain } from "@/lib/platform/tenancy/provisioning";
import { requireModule } from "@/lib/platform/billing/enforce";
import { unavailablePanelKeys } from "@/lib/platform/panels/store";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { lockedModuleKeys } from "@/lib/platform/products/availability";
import { productRuleFor, ruleAllows } from "@/lib/platform/products/routes";
import { INCLUDED_WITH, ownedModules, SELLABLE_PRODUCTS } from "@/lib/platform/products/selection";
import { MODULES } from "@/lib/platform/onboarding/catalog";
import { PRODUCT_URL_SLUGS } from "@/lib/platform/saas/product-routes";
import { proxy } from "@/proxy";

let checks = 0;
function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  checks++;
}
function eq<T>(a: T, b: T, msg: string) {
  assert.deepEqual(a, b, msg);
  checks++;
}

/** Every real URL of the app: route groups dropped, parameters filled in. */
function appUrls(dir = "src/app", prefix = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...appUrls(join(dir, e.name), /^\(.*\)$/.test(e.name) ? prefix : `${prefix}/${e.name.replace(/^\[.*\]$/, "x")}`));
    else if (/^(page|route)\.tsx?$/.test(e.name)) out.push(prefix || "/");
  }
  return out;
}

const GATED = MODULES.filter((m) => !m.core).map((m) => m.key as string);
const MACHINE = /\/(webhooks?|cron|callback)(\/|$)/i;

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);

  // --- the rules, over every real URL ----------------------------------------------
  const urls = [...new Set(appUrls())];
  ok(urls.length > 500, `found the app's URLs (${urls.length})`);
  for (const key of GATED) {
    const slug = PRODUCT_URL_SLUGS[key];
    const own = urls.filter((u) => (u === `/${slug}` || u.startsWith(`/${slug}/`) || u.startsWith(`/api/${slug}/`)) && !MACHINE.test(u));
    ok(own.length > 0, `${key} has screens`);
    for (const u of own) {
      const rule = productRuleFor(u);
      ok(rule && rule.modules[0] === key && (rule.modules.length === 1 || key === "portal"), `${u} belongs to ${key}`);
    }
  }
  for (const product of SELLABLE_PRODUCTS) {
    const modules = ownedModules({ mode: "selected", keys: [product] });
    for (const u of urls) {
      const rule = productRuleFor(u);
      if (rule && !rule.modules.some((m) => m === product || INCLUDED_WITH[product]?.includes(m)) && rule.modules.every((m) => GATED.includes(m))) assert.ok(!ruleAllows(rule, modules), `${product} alone must not open ${u}`);
    }
    for (const u of ["/commandos", "/commandos/users", "/commandos/settings/billing", "/commandos/upgrade", "/huddle-ai", "/resolveiq", "/api/huddle-ai/upload"]) assert.ok(!productRuleFor(u), `${u} is open to everyone`);
    const slug = PRODUCT_URL_SLUGS[product];
    const mine = productRuleFor(`/${slug}`);
    assert.ok(!mine || ruleAllows(mine, modules), `${product} opens itself`);
    checks++;
  }
  eq(productRuleFor("/verify/abc"), null, "issued certificates stay checkable");
  for (const u of ["/api/evaliq/cron", "/api/cashflow-ai/webhooks/razorpay/c1", "/api/dealflow-ai/meetings/cron"]) eq(productRuleFor(u), null, `${u}: machine calls are not refused`);
  eq(productRuleFor("/pay/tok")?.audience, "external", "payment page is for outsiders");
  eq(productRuleFor("/evaliq/take/x")?.audience, "external", "test taking is for outsiders");
  eq(productRuleFor("/commandos/analytics/cashflow-ai")?.modules, ["fms"], "analytics follows the product");
  eq(productRuleFor("/commandos/pms-other"), null, "a prefix matches whole path parts only");

  // --- a real company with only TalentOS -------------------------------------------
  await listPlans();
  const now = new Date();
  const company = async (slug: string) => {
    const id = randomUUID();
    await db.collection("companies").insertOne({ _id: id as never, slug, name: slug, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
    await updateCompanySubscription(id, { planId: "growth", status: "active" });
    return id;
  };
  const one = await company("onlyhr");
  const all = await company("everything");
  ok((await setCompanyProducts(one, { products: "hrms" }, { id: "tester" })).ok, "TalentOS only");

  const locked = await lockedModuleKeys(one);
  eq([...locked].sort(), [...GATED.filter((k) => k !== "hrms"), "website"].sort(), "every other product is locked, and there is no website");
  eq((await lockedModuleKeys(all)).size, 0, "an existing company has nothing locked");
  const off = await unavailablePanelKeys(one);
  ok(off.has("fms") && off.has("portal") && !off.has("hrms") && !off.has("messenger") && !off.has("support"), "menus, dashboard and assistant see the same list");

  await runAsCompany(one, () => requireModule("hrms"));
  checks++;
  await assert.rejects(runAsCompany(one, () => requireModule("fms")), (e: { digest?: string }) => String(e.digest).includes("/commandos/upgrade?module=fms"));
  checks++;

  const call = async (slug: string, path: string, method = "GET") => {
    const host = companyAppSubdomain(slug);
    const res = await proxy(new NextRequest(`http://${host}${path}`, { method, headers: { host, origin: `http://${host}`, "sec-fetch-site": "same-origin", "sec-fetch-mode": method === "GET" ? "navigate" : "cors", accept: "text/html", "accept-language": "en-IN", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" } }));
    return { status: res.status, location: res.headers.get("location") ?? "", rewrite: res.headers.get("x-middleware-rewrite") ?? "" };
  };
  for (const key of GATED.filter((k) => k !== "portal")) {
    const path = `/${PRODUCT_URL_SLUGS[key]}`;
    const r = await call("onlyhr", path);
    if (key === "hrms") ok(!r.location.includes("/upgrade") && r.status < 400, `its own product opens (${r.status} ${r.location})`);
    else ok(r.location.endsWith(`/commandos/upgrade?module=${key}`), `${path} leads to upgrade (${r.status} ${r.location})`);
    const other = await call("everything", path);
    ok(!other.location.includes("/upgrade") && other.status < 400, `an existing company still opens ${path} (${other.status})`);
  }
  const api = await call("onlyhr", "/api/cashflow-ai/reports/profit");
  ok(api.status === 401 || api.status === 403, "another product's staff API never answers an outsider");
  eq((await call("onlyhr", "/api/agentos-public/session", "POST")).status, 403, "another product's public API");
  ok([401, 403].includes((await call("onlyhr", "/cashflow-ai/invoices", "POST")).status), "another product's form post / server action is refused");
  eq((await call("onlyhr", "/commandos/prms/vendors")).location.endsWith("module=prms"), true, "CommandOS screen of another product");
  const pay = await call("onlyhr", "/pay/sometoken");
  ok(pay.status === 403 && pay.rewrite.includes("/product-unavailable"), "outsiders see 'not available'");
  ok((await call("onlyhr", "/commandos")).status < 400, "CommandOS opens");
  ok((await call("onlyhr", "/huddle-ai")).status < 400, "Huddle opens");

  // adding the product opens it at once
  ok((await setCompanyProducts(one, { products: ["hrms", "fms"] }, { id: "tester" })).ok, "add CashFlow");
  eq((await lockedModuleKeys(one)).has("fms"), false, "unlocked for guards");
  await runAsCompany(one, () => requireModule("fms"));
  checks++;

  console.log(`product gating: all ${checks} checks passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await clientPromise;
    await c.db().dropDatabase();
    await c.close();
    process.exit(process.exitCode ?? 0);
  });
