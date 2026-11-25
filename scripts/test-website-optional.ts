/**
 * The website is optional: a company without one gets no starter pages, its site address leads to its own website or
 * the hosted forms, payment / verify / signing links keep working, the forms can be embedded in its website, openings
 * are kept by hand and the website can be switched on later. Runs against a throwaway database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { listPlans } from "@/lib/platform/billing/plans";
import { createCompanyWithOwner, companySubdomain, companyAppSubdomain } from "@/lib/platform/tenancy/provisioning";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { entitlementsFor } from "@/lib/platform/billing/entitlements";
import { unavailablePanelKeys } from "@/lib/platform/panels/store";
import { embedOrigin, websitelessTarget } from "@/lib/platform/products/website";
import { addOpening, listOpenings, setOpeningOpen } from "@/lib/products/talentos/openings";
import { getOpenJobPositions } from "@/lib/career-applications";
import { getPageByPath } from "@/lib/products/sitecraft-ai/pages";
import { publishStarterWebsite } from "@/lib/platform/website/starter";
import { hashPassword } from "@/lib/lms-auth";
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

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  process.env.AI_WEBSITE_ON_SIGNUP = "0";

  // --- rules ---------------------------------------------------------------------
  for (const p of ["/forms", "/forms/careers", "/pay/t", "/verify/c", "/sign/t", "/login", "/clientos/tests", "/api/careers/apply"]) eq(websitelessTarget(p, null), null, `${p} stays`);
  eq(websitelessTarget("/", null), "/forms", "home leads to the forms");
  eq(websitelessTarget("/", "https://acme.example"), "https://acme.example", "or to the company's website");
  eq(websitelessTarget("/careers/apply", "https://acme.example"), "/forms/careers", "old careers links keep working");
  eq(websitelessTarget("/contact", null), "/forms/enquiry", "contact keeps working");
  eq(websitelessTarget("/about", null), "/forms", "marketing pages are gone");
  eq([embedOrigin("https://acme.example/page"), embedOrigin("javascript:alert(1)"), embedOrigin(null)], ["https://acme.example", null, null], "who may embed");

  await listPlans();
  const make = (slug: string, extra: Record<string, unknown>) => createCompanyWithOwner({ name: slug, slug, owner: { email: `o@${slug}.test`, name: "Owner Person", passwordHash: hashPassword(randomUUID()), mustChangePassword: false }, ...extra } as never);
  const plain = await make("nosite", { products: { mode: "selected", keys: ["hrms"] } });
  const own = await make("ownsite", { products: { mode: "all" }, website: { mode: "external", externalUrl: "https://acme.example" } });
  const withSite = await make("withsite", { products: { mode: "all" } });
  ok(plain.ok && own.ok && withSite.ok, `companies made ${JSON.stringify([plain, own, withSite])}`);
  if (!plain.ok || !own.ok || !withSite.ok) return;

  const pages = (id: string) => runAsCompany(id, async () => Boolean(await getPageByPath("/")));
  eq([await pages(plain.companyId), await pages(own.companyId), await pages(withSite.companyId)], [false, false, true], "starter pages only for a website we run");
  eq([(await entitlementsFor(plain.companyId)).sites, (await entitlementsFor(own.companyId)).sites, (await entitlementsFor(withSite.companyId)).sites], [false, false, true], "entitlements");
  ok((await unavailablePanelKeys(plain.companyId)).has("website") && !(await unavailablePanelKeys(withSite.companyId)).has("website"), "menus hide the website");

  const call = async (host: string, path: string) => {
    const res = await proxy(new NextRequest(`http://${host}${path}`, { headers: { host, "sec-fetch-mode": "navigate", accept: "text/html", "accept-language": "en-IN", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" } }));
    return { status: res.status, location: res.headers.get("location") ?? "", csp: res.headers.get("content-security-policy") ?? "", rewrite: res.headers.get("x-middleware-rewrite") ?? "" };
  };
  const site = companySubdomain("nosite");
  ok((await call(site, "/")).location.endsWith("/forms"), "no website: home → forms");
  ok((await call(site, "/careers/apply")).location.endsWith("/forms/careers"), "careers → form");
  const form = await call(site, "/forms/careers");
  ok(form.status === 200 && !form.rewrite.includes("unavailable"), `TalentOS company has the careers form ${JSON.stringify(form)}`);
  ok((await call(site, "/forms/enquiry")).rewrite.includes("/product-unavailable"), "no enquiry form without a product that reads it");
  ok((await call(site, "/verify/abc")).status === 200, "certificates can be checked");
  ok(/frame-ancestors 'self';/.test(form.csp), "no own website: nobody else may frame");

  const ext = companySubdomain("ownsite");
  eq((await call(ext, "/")).location, "https://acme.example/", "home → their website");
  ok(/frame-ancestors 'self' https:\/\/acme\.example;/.test((await call(ext, "/forms/enquiry")).csp), "their website may embed the forms");
  ok(!(await call(ext, "/pay/token")).location, "payment links keep working");
  ok(!(await call(companySubdomain("withsite"), "/")).location, "a website we run is served as before");
  ok(!(await call(companyAppSubdomain("nosite"), "/commandos")).location.includes("/forms"), "the app address is untouched");

  // --- openings by hand, for the careers form -------------------------------------------
  await runAsCompany(plain.companyId, async () => {
    ok(!(await addOpening({ title: "" })).ok, "a title is needed");
    const a = await addOpening({ title: "Accountant", category: "Finance" });
    const b = await addOpening({ title: "Accountant" });
    ok(a.ok && b.ok && a.ok && b.ok && a.slug !== b.slug, "two openings with one title");
    if (b.ok) await setOpeningOpen(b.slug, false);
    eq((await getOpenJobPositions()).map((p) => p.slug), ["accountant"], "the form offers the open ones");
    eq((await listOpenings()).length, 2, "closed ones are kept");
    ok(!(await setOpeningOpen("nope", true)).ok, "unknown opening");
    ok(!(await getDb().then((d) => d.collection("cms_pages").countDocuments())), "still no website pages");
  });

  // --- switching the website on later ---------------------------------------------------
  ok((await setCompanyProducts(own.companyId, { products: "all", website: { mode: "platform" } }, { id: "tester" })).ok, "switch on");
  await runAsCompany(own.companyId, () => publishStarterWebsite());
  ok(await pages(own.companyId), "starter pages appear");
  ok(!(await call(ext, "/")).location, "and the site is served");

  console.log(`website optional: all ${checks} checks passed`);
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
