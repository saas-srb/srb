/**
 * Browser test for the Platform Console shell and Tax & invoicing settings,
 * against a RUNNING server (production build recommended).
 *
 *   PANEL_BASE_URL=http://localhost:3006 OWNER_EMAIL=... OWNER_PASSWORD=... \
 *   TEST_COMPANY_URL=http://acme.localhost:3006 node scripts/e2e/platform-product.e2e.mjs
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.PANEL_BASE_URL ?? "http://localhost:3000";
const COMPANY_URL = process.env.TEST_COMPANY_URL;
const EMAIL = process.env.OWNER_EMAIL;
const PASSWORD = process.env.OWNER_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Set OWNER_EMAIL and OWNER_PASSWORD.");
  process.exit(2);
}

let passed = 0;
const failures = [];
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

try {
  if (COMPANY_URL) {
    await step("the product doesn't exist on a company's host", async () => {
      const res = await page.goto(`${COMPANY_URL}/console`);
      assert.equal(res?.status(), 404);
    });
  }

  await step("signed-out visitors are sent to sign in", async () => {
    await page.goto(`${BASE}/console`);
    assert.ok(new URL(page.url()).pathname.endsWith("/commandos/login"), page.url());
  });

  await step("owner signs in and lands on the dashboard", async () => {
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 }), page.press('input[name="password"]', "Enter")]);
    await page.goto(`${BASE}/console`);
    await page.getByRole("heading", { name: "Dashboard" }).waitFor();
    await page.getByText("Trials ending in 7 days").waitFor();
  });

  await step("sidebar links to every SaaS area", async () => {
    const nav = page.getByRole("navigation", { name: "Platform Console" }).first();
    const labels = ["Companies", "Sign-ups & approvals", "Domains & SSL", "Plans & pricing", "Subscriptions", "SaaS invoices", "Coupons & discounts", "Add-ons", "Payments & Razorpay", "Tax & invoicing", "Revenue & subscriptions", "Usage & limits", "Platform users & roles", "Integrations", "Audit log", "Platform settings"];
    for (const label of labels) await nav.getByRole("link", { name: label, exact: true }).waitFor();
    assert.equal(await nav.getByText("Soon", { exact: true }).count(), 0, "nothing is marked Soon");
  });

  await step("the Platform Console is SaaS-only: its one link back to a company surface is the plain Workspace link", async () => {
    const back = await page.locator('aside a[href^="/commandos"], aside a[href^="/settings"], aside a[href^="/onboarding"]').evaluateAll((els) => els.map((e) => [e.getAttribute("href"), e.getAttribute("aria-label") ?? e.textContent?.trim()]));
    assert.deepEqual(back, [["/commandos", "Workspace"]]);
    assert.equal(await page.getByText("Staff Hub").count(), 0, "no Staff Hub link in the Platform Console");
  });

  await step("every sidebar page opens without an error", async () => {
    const nav = page.getByRole("navigation", { name: "Platform Console" }).first();
    const hrefs = await nav.getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    for (const href of hrefs) {
      const res = await page.goto(`${BASE}${href}`);
      assert.equal(res?.status(), 200, `${href} returned ${res?.status()}`);
      assert.equal(new URL(page.url()).pathname, href, `${href} redirected to ${page.url()}`);
      await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 30_000 });
    }
    await page.goto(`${BASE}/console`);
  });

  await step("companies and sign-ups pages render in the product", async () => {
    await page.goto(`${BASE}/console/companies`);
    await page.getByRole("heading", { name: "Companies", level: 1 }).waitFor();
    await page.goto(`${BASE}/console/signups`);
    await page.getByRole("heading", { name: "Sign-ups & approvals", level: 1 }).waitFor();
  });

  await step("old /console links redirect into the product", async () => {
    await page.goto(`${BASE}/console`);
    assert.equal(new URL(page.url()).pathname, "/console/companies");
    await page.goto(`${BASE}/console/signups`);
    assert.equal(new URL(page.url()).pathname, "/console/signups");
  });

  await step("Tax & invoicing: invalid GSTIN rejected, valid settings saved", async () => {
    await page.goto(`${BASE}/console/settings/billing`);
    await page.getByRole("heading", { name: "Tax & invoicing" }).waitFor();
    await page.fill("#s-legal", "E2E Platform Pvt Ltd");
    await page.fill("#s-gstin", "BADGSTIN");
    await page.getByRole("button", { name: "Save settings" }).click();
    await page.getByText("That isn't a valid GSTIN").waitFor({ timeout: 30_000 });
    await page.fill("#s-gstin", "33ABCDE1234F1Z7");
    await page.fill("#b-trial", "30");
    await page.getByRole("button", { name: "Save settings" }).click();
    await page.getByText("Saved.").waitFor({ timeout: 30_000 });
    await page.reload();
    assert.equal(await page.inputValue("#s-gstin"), "33ABCDE1234F1Z7");
    assert.equal(await page.inputValue("#s-state"), "33", "state derived from GSTIN");
    assert.equal(await page.inputValue("#b-trial"), "30");
  });

  await step("no horizontal scroll at phone width, no page errors", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/console", "/console/companies", "/console/settings/billing"]) {
      await page.goto(`${BASE}${path}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${path} scrolls horizontally by ${overflow}px`);
    }
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
