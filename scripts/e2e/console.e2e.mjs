/**
 * Browser test for the Platform Console (/platform) against a RUNNING
 * dev/preview server. Never point it at production data: it suspends and
 * reactivates a company and approves a sign-up.
 *
 *   CONSOLE_BASE_URL=http://localhost:3000 \
 *   OWNER_EMAIL=root@demo.test OWNER_PASSWORD=... \
 *   TEST_COMPANY_SLUG=acme \
 *   [TEST_COMPANY_URL=http://acme.localhost:3000] \
 *   [E2E_MONGODB_URI=mongodb://127.0.0.1:27099/some_test_db] \
 *     node scripts/e2e/console.e2e.mjs
 *
 * - OWNER_* = a Super Admin of the platform-owner company.
 * - TEST_COMPANY_SLUG = a disposable, active, non-owner company.
 * - E2E_MONGODB_URI (optional, local "test" databases only) seeds a sign-up
 *   awaiting approval so the approve path can run; without it the approve
 *   step uses the first request already in the queue, or is skipped.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

const BASE = (process.env.CONSOLE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
const SLUG = process.env.TEST_COMPANY_SLUG;
if (!OWNER_EMAIL || !OWNER_PASSWORD || !SLUG) {
  console.error("Set OWNER_EMAIL, OWNER_PASSWORD and TEST_COMPANY_SLUG.");
  process.exit(1);
}
const COMPANY_URL = (process.env.TEST_COMPANY_URL ?? `${new URL(BASE).protocol}//${SLUG}.${new URL(BASE).host}`).replace(/\/$/, "");

let passed = 0;
const failures = [];
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function seedApprovalRequest() {
  const uri = process.env.E2E_MONGODB_URI;
  if (!uri) return null;
  const dbName = uri.split("/").pop()?.split("?")[0] ?? "";
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri) || !dbName.includes("test")) throw new Error("E2E_MONGODB_URI must be a local database with \"test\" in its name");
  const { MongoClient } = await import("mongodb");
  const client = await new MongoClient(uri).connect();
  try {
    const slug = `e2e${Date.now().toString(36)}`;
    const now = new Date();
    await client.db().collection("pending_signups").insertOne({
      _id: randomUUID(),
      tokenHash: randomUUID(),
      email: `owner@${slug}.test`,
      name: "E2E Requester",
      companyName: `E2E ${slug}`,
      slug,
      // Never used to sign in during this test.
      passwordHash: "e2e:not-a-real-hash",
      status: "awaiting_approval",
      createdAt: now,
      expiresAt: new Date(now.getTime() + 30 * 86400_000),
    });
    return { slug, email: `owner@${slug}.test`, companyName: `E2E ${slug}` };
  } finally {
    await client.close();
  }
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await step("/console 404s on a company's own host", async () => {
      const res = await page.goto(`${COMPANY_URL}/console`);
      assert.equal(res?.status(), 404);
      await page.goto(`${COMPANY_URL}/console/signups`).then((r) => assert.equal(r?.status(), 404));
    });

    await step("owner signs in and opens the Platform Console", async () => {
      await page.goto(`${BASE}/commandos/login`);
      await page.getByLabel("Email").fill(OWNER_EMAIL);
      await page.locator('input[name="password"]').fill(OWNER_PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/commandos/login"), { timeout: 30_000 });
      await page.goto(`${BASE}/console`);
      await page.getByText("Awaiting approval").first().waitFor();
      await page.goto(`${BASE}/console/companies`);
      await page.getByRole("heading", { name: "Companies", level: 1 }).waitFor();
    });

    await step("companies table lists and filters companies", async () => {
      await page.goto(`${BASE}/console/companies?q=${encodeURIComponent(SLUG)}`);
      await page.locator(`a[href^="/console/companies/"]`, { hasText: SLUG }).first().waitFor();
    });

    await step("suspend the test company (confirm step), its host then shows 'No workspace here'", async () => {
      await page.locator(`a[href^="/console/companies/"]`, { hasText: SLUG }).first().click();
      await page.getByRole("button", { name: "Suspend company" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Suspend", exact: true }).click();
      await page.getByRole("button", { name: "Reactivate company" }).waitFor({ timeout: 15_000 });
      const detailUrl = page.url();

      const probe = await context.newPage();
      const res = await probe.goto(COMPANY_URL);
      assert.equal(res?.status(), 404);
      await probe.getByRole("heading", { name: "No workspace here" }).waitFor();

      await page.goto(detailUrl);
      await page.getByRole("button", { name: "Reactivate company" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Reactivate", exact: true }).click();
      await page.getByRole("button", { name: "Suspend company" }).waitFor({ timeout: 15_000 });
      const back = await probe.goto(COMPANY_URL);
      assert.notEqual(back?.status(), 404, "reactivated company routes again");
      await probe.close();
    });

    await step("the platform owner company offers no suspend button", async () => {
      await page.goto(`${BASE}/console/companies`);
      const ownerRow = page.locator("tr", { hasText: "Platform owner" }).first();
      await ownerRow.locator(`a[href^="/console/companies/"]`).first().click();
      await page.getByText("can't be suspended").waitFor();
      assert.equal(await page.getByRole("button", { name: "Suspend company" }).count(), 0);
    });

    const seeded = await seedApprovalRequest();
    await step("approval queue: approve a request", async () => {
      await page.goto(`${BASE}/console/signups`);
      await page.getByText("Who can create a company", { exact: true }).waitFor();
      const row = seeded ? page.locator(`li[data-signup-email="${seeded.email}"]`) : page.locator("li[data-signup-email]").first();
      if (!seeded && (await row.count()) === 0) {
        console.log("      (skipped: queue empty and no E2E_MONGODB_URI to seed one)");
        return;
      }
      await row.getByRole("button", { name: "Approve" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Approve", exact: true }).click();
      await page.getByText(/^Approved/).waitFor({ timeout: 30_000 });
      if (seeded) {
        assert.equal(await page.locator(`li[data-signup-email="${seeded.email}"]`).count(), 0, "request left the queue");
        await page.goto(`${BASE}/console/companies?q=${encodeURIComponent(seeded.slug)}`);
        await page.locator(`a[href^="/console/companies/"]`, { hasText: seeded.slug }).first().waitFor();
      }
    });
  } finally {
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
