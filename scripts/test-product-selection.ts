/**
 * Product selection: which products a company owns, the website rule, and what that does to entitlements.
 * Runs against a throwaway database that is dropped at the end.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { listPlans } from "@/lib/platform/billing/plans";
import { updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { entitlementsFor } from "@/lib/platform/billing/entitlements";
import { MODULES } from "@/lib/platform/onboarding/catalog";
import { INCLUDED_WITH, ownedModules, parseSelection, resolveWebsite, restrictToOwned, SELLABLE_PRODUCTS, sitesEnabled } from "@/lib/platform/products/selection";
import { setCompanyProducts } from "@/lib/platform/products/company-products";

let checks = 0;
function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  checks++;
}
function eq<T>(a: T, b: T, msg: string) {
  assert.deepEqual(a, b, msg);
  checks++;
}
const sorted = (s: ReadonlySet<string> | null) => (s === null ? null : [...s].sort());
const BASE = ["admin", "messenger", "workspace"];

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);

  // --- rules -----------------------------------------------------------------
  eq(SELLABLE_PRODUCTS.length, MODULES.length - 4, "every product but CommandOS (two keys), ClientOS and DataBrain can be picked");
  ok(!SELLABLE_PRODUCTS.includes("workspace") && !SELLABLE_PRODUCTS.includes("admin") && !SELLABLE_PRODUCTS.includes("portal"), "CommandOS and ClientOS are not offered");
  ok(SELLABLE_PRODUCTS.includes("messenger") && SELLABLE_PRODUCTS.includes("cms"), "Huddle and SiteCraft are offered");
  eq(parseSelection("all"), { mode: "all" }, "all products");
  eq(parseSelection("hrms"), { mode: "selected", keys: ["hrms"] }, "one product");
  eq(parseSelection(["fms", "hrms", "fms"]), { mode: "selected", keys: ["hrms", "fms"] }, "several, de-duplicated in catalogue order");
  for (const bad of ["", "portal", "workspace", "admin", "website", "nope"]) eq(parseSelection(bad), null, `"${bad}" can't be bought`);
  eq(parseSelection("intelligence"), null, "DataBrain is not bought alone");
  eq(parseSelection(["intelligence", "sop"]), null, "nor beside a product without data it reads");
  eq(parseSelection(["intelligence", "hrms"]), { mode: "selected", keys: ["hrms", "intelligence"] }, "beside a data product it is");
  ok(ownedModules({ mode: "selected", keys: ["hrms", "intelligence"] })!.has("intelligence"), "and then owned");
  ok(!ownedModules({ mode: "selected", keys: ["intelligence"] })!.has("intelligence"), "not without data");
  eq(parseSelection(["all", "hrms"]), null, "all plus a product is refused");
  eq(parseSelection(["hrms", "portal"]), null, "ClientOS can't be added beside a product");

  eq(sorted(ownedModules({ mode: "selected", keys: ["lpms"] })), sorted(new Set([...BASE, "lpms", "sop"])), "ContractFlow comes with Playbook");
  ok(!ownedModules({ mode: "selected", keys: ["sop"] })!.has("lpms"), "Playbook alone does not bring ContractFlow");
  eq(ownedModules(undefined), null, "no record = everything (existing companies)");
  eq(ownedModules({ mode: "all" }), null, "all = everything");
  for (const key of SELLABLE_PRODUCTS) eq(sorted(ownedModules({ mode: "selected", keys: [key] })), sorted(new Set([...BASE, key, ...(INCLUDED_WITH[key] ?? [])])), `${key} alone: itself, what comes with it and the included ones`);
  eq(sorted(restrictToOwned(new Set(["workspace", "hrms", "fms"]), new Set(["workspace", "hrms", "pms"]))), ["hrms", "workspace"], "plan AND owned");

  eq(resolveWebsite({ mode: "selected", keys: ["hrms"] }, undefined).mode, "none", "a product without SiteCraft has no website");
  eq(resolveWebsite({ mode: "selected", keys: ["hrms"] }, { mode: "platform" }).mode, "none", "and can't ask for one");
  eq(resolveWebsite({ mode: "selected", keys: ["cms"] }, { mode: "none" }).mode, "platform", "SiteCraft comes with the website");
  eq(resolveWebsite({ mode: "all" }, undefined).mode, "platform", "all products: website by default");
  eq(resolveWebsite({ mode: "all" }, { mode: "external", externalUrl: "https://acme.example" }), { mode: "external", externalUrl: "https://acme.example" }, "all products: own website kept");
  ok(sitesEnabled(undefined, undefined, null), "existing company keeps its website");
  ok(!sitesEnabled({ mode: "all" }, { mode: "none" }, null), "all products without a website");
  ok(!sitesEnabled({ mode: "selected", keys: ["hrms"] }, undefined, new Set(["hrms"])), "no SiteCraft, no website");
  ok(sitesEnabled({ mode: "selected", keys: ["hrms"] }, { mode: "none" }, new Set(["hrms", "cms"])), "SiteCraft unlocked from the Console brings the website");

  // --- entitlements ------------------------------------------------------------
  await listPlans();
  const now = new Date();
  const company = async (slug: string, extra: Record<string, unknown> = {}) => {
    const id = randomUUID();
    await db.collection("companies").insertOne({ _id: id as never, slug, name: slug, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now, ...extra });
    await updateCompanySubscription(id, { planId: "growth", status: "active" });
    return id;
  };
  const old = await company("old-co");
  let e = await entitlementsFor(old);
  eq([e.modules, e.sites], [null, true], "a company from before keeps every product and its website");

  const one = await company("one-co");
  ok((await setCompanyProducts(one, { products: "hrms" }, { id: "tester" })).ok, "set one product");
  e = await entitlementsFor(one);
  eq(sorted(e.modules), sorted(new Set([...BASE, "hrms"])), "only that product");
  eq(e.sites, false, "no website");

  ok((await setCompanyProducts(one, { products: ["hrms", "cms"] }, { id: "tester" })).ok, "add SiteCraft");
  e = await entitlementsFor(one);
  eq([e.modules?.has("cms"), e.sites], [true, true], "SiteCraft brings the website");

  ok((await setCompanyProducts(one, { products: "all", website: { mode: "external", externalUrl: "https://acme.example" } }, { id: "tester" })).ok, "move to all products with an own website");
  e = await entitlementsFor(one);
  eq([e.modules, e.sites], [null, false], "everything, website elsewhere");

  ok(!(await setCompanyProducts(one, { products: "portal" }, { id: "tester" })).ok, "ClientOS alone refused");
  ok(!(await setCompanyProducts(one, { products: "all", website: { mode: "external", externalUrl: "acme" } }, { id: "tester" })).ok, "bad website address refused");
  ok(!(await setCompanyProducts("missing", { products: "all" }, { id: "tester" })).ok, "unknown company refused");

  // A plan that includes only some products still narrows what was bought.
  await db.collection("billing_plans").insertOne({ _id: "narrow" as never, name: "Narrow", currency: "INR", priceMonthly: 100, priceYearly: 1000, modules: ["fms"], limits: { seats: 5, aiTokensPerMonth: null, storageMb: null }, active: true, isDefault: false, sortOrder: 99, createdAt: now, updatedAt: now });
  const both = await company("both-co");
  await updateCompanySubscription(both, { planId: "narrow", status: "active" });
  await setCompanyProducts(both, { products: ["hrms", "fms"] }, { id: "tester" });
  eq(sorted((await entitlementsFor(both)).modules), sorted(new Set([...BASE, "fms"])), "owned AND in the plan");

  // A Platform Console unlock adds to what was bought.
  await updateCompanySubscription(both, { overrides: { modules: { pms: { on: true } } } as never });
  ok((await entitlementsFor(both)).modules?.has("pms"), "Console unlock");

  const owner = await company("owner-co", { isPlatformOwner: true });
  ok(!(await setCompanyProducts(owner, { products: "hrms" }, { id: "tester" })).ok, "the platform's own company is never narrowed");

  ok((await db.collection("platform_audit_log").countDocuments({ action: "company.products.set", companyId: one })) === 3, "every change audited");
  console.log(`product selection: all ${checks} checks passed`);
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
  });
