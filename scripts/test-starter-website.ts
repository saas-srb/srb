/**
 * Checks the starter website published for a new company, against a
 * throwaway database (dropped at the end). Never point it at a real one.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/starter_test_$(date +%s) EMAIL_PROVIDER=console \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-starter-website.ts
 */
import assert from "node:assert/strict";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { createCompanyWithOwner } from "@/lib/platform/tenancy/provisioning";
import { getPageByPath } from "@/lib/products/sitecraft-ai/pages";
import { getSiteInfoForEdit } from "@/lib/products/sitecraft-ai/site-info";
import { listNavItems } from "@/lib/products/sitecraft-ai/nav";
import { publishStarterWebsite, syncSiteContact } from "@/lib/platform/website/starter";
import { hashPassword } from "@/lib/lms-auth";

async function main() {
  const db = await getPlatformDb();
  if (!/_test_|test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}" — use a throwaway test database`);
  const res = await createCompanyWithOwner({ name: "Initech Labs", slug: "initech-labs", owner: { email: "owner@initech.test", name: "Peter", passwordHash: hashPassword("Initech#2026x"), mustChangePassword: false } });
  assert.ok(res.ok, "company created");
  if (!res.ok) return;
  await runAsCompany(res.companyId, async () => {
    for (const path of ["/", "/services", "/about", "/contact", "/privacy-policy"]) {
      const page = await getPageByPath(path);
      assert.ok(page?.live, `${path} published`);
      const text = JSON.stringify(page.live);
      assert.ok(!/demo/i.test(text), `${path} mentions Demo Company`);
    }
    assert.ok(JSON.stringify((await getPageByPath("/"))!.live).includes("Initech Labs"), "home uses the company name");
    const info = await getSiteInfoForEdit();
    assert.equal(info.brand.namePrimary, "Initech Labs");
    assert.equal(info.contact.email, "", "no contact guessed");
    assert.ok(!/demo/i.test(JSON.stringify({ ...info, text: undefined })), "site identity mentions Demo Company");
    assert.ok(!/demo/i.test(Object.values(info.text).join(" ")), "text values mention Demo Company");
    assert.equal((await listNavItems()).filter((n) => !n.parentId).length, 2, "two top-level menus");
    // Idempotent: a second run creates nothing new.
    const again = await publishStarterWebsite();
    assert.deepEqual(again, { pagesCreated: [], navigation: false, footer: false, siteInfo: false, contactForm: false });
    // Profile contact fills the blank contact block once.
    await syncSiteContact({ email: "hello@initech.test", phone: "+91 98765 43210" });
    const synced = await getSiteInfoForEdit();
    assert.equal(synced.contact.email, "hello@initech.test");
    assert.equal(synced.contact.phoneHref, "tel:+919876543210");
  });
  console.log("starter website: all checks passed");
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
