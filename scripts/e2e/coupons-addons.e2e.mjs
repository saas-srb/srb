/**
 * Browser test for Coupons & discounts, Add-ons and the company add-ons card
 * in the Platform Console, against a RUNNING server (production build recommended).
 * Creates uniquely named records each run (it never deletes; coupons/add-ons
 * are deactivated at the end).
 *
 *   PANEL_BASE_URL=http://localhost:3006 OWNER_EMAIL=... OWNER_PASSWORD=... \
 *   TEST_COMPANY_ID=<a non-owner company id, optional> node scripts/e2e/coupons-addons.e2e.mjs
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.PANEL_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.OWNER_EMAIL;
const PASSWORD = process.env.OWNER_PASSWORD;
const COMPANY_ID = process.env.TEST_COMPANY_ID;
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

const RUN = Date.now().toString(36).toUpperCase();
const CODE = `E2E${RUN}`;
const ADDON = `E2E seats ${RUN}`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

let couponUrl = null;
let addonUrl = null;

try {
  await step("owner signs in", async () => {
    await page.goto(`${BASE}/console/coupons`);
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 }), page.press('input[name="password"]', "Enter")]);
    await page.goto(`${BASE}/console/coupons`);
    await page.getByRole("heading", { name: "Coupons & discounts", level: 1 }).waitFor();
  });

  await step("coupon form validates", async () => {
    await page.getByRole("link", { name: "New coupon" }).click();
    await page.getByRole("heading", { name: "New coupon", level: 1 }).waitFor();
    await page.fill("#c-code", "x");
    await page.fill("#c-percent", "150");
    await page.getByRole("button", { name: "Create coupon" }).click();
    await page.getByText("Use 3–32 letters").waitFor({ timeout: 30_000 });
    await page.getByText("Enter a percentage between 0 and 100.").waitFor();
  });

  await step("create a coupon (20%, yearly only, max 5)", async () => {
    await page.fill("#c-code", CODE.toLowerCase());
    await page.fill("#c-percent", "20");
    await page.getByRole("checkbox", { name: "monthly" }).uncheck();
    await page.fill("#c-max", "5");
    await page.fill("#c-desc", "Created by the e2e test");
    await page.getByRole("button", { name: "Create coupon" }).click();
    await page.waitForURL((u) => /\/platform\/coupons\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/new"), { timeout: 30_000 });
    couponUrl = page.url();
    await page.getByRole("heading", { name: CODE, level: 1 }).waitFor();
    await page.getByText("0 of 5 redemptions used").waitFor();
    await page.getByText("Nobody has redeemed this coupon yet.").waitFor();
  });

  await step("duplicate code (different case) is rejected", async () => {
    await page.goto(`${BASE}/console/coupons/new`);
    await page.fill("#c-code", CODE.toLowerCase());
    await page.fill("#c-percent", "10");
    await page.getByRole("button", { name: "Create coupon" }).click();
    await page.getByText("A coupon with this code already exists.").waitFor({ timeout: 30_000 });
  });

  await step("coupon listed with redemptions used/limit", async () => {
    await page.goto(`${BASE}/console/coupons`);
    await page.getByRole("link", { name: new RegExp(CODE) }).first().waitFor();
    assert.equal((await page.getByTestId(`redemptions-${CODE}`).first().innerText()).replace(/\s+/g, " ").trim(), "0 / 5");
  });

  await step("edit and deactivate the coupon", async () => {
    await page.goto(couponUrl);
    await page.fill("#c-max", "10");
    await page.getByRole("button", { name: "Save coupon" }).click();
    await page.getByText("Saved.").waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Deactivate coupon" }).click();
    await page.getByRole("button", { name: "Activate coupon" }).waitFor({ timeout: 30_000 });
    await page.reload();
    await page.getByText("0 of 10 redemptions used").waitFor();
    assert.equal(await page.inputValue("#c-max"), "10");
  });

  await step("create a limit-booster add-on", async () => {
    await page.goto(`${BASE}/console/addons`);
    await page.getByRole("heading", { name: "Add-ons", level: 1 }).waitFor();
    await page.getByRole("link", { name: "New add-on" }).click();
    await page.fill("#a-name", ADDON);
    await page.fill("#a-monthly", "250");
    await page.fill("#a-yearly", "2500");
    await page.selectOption("#a-limit", "seats");
    await page.fill("#a-amount", "5");
    await page.fill("#a-maxqty", "4");
    await page.getByRole("button", { name: "Create add-on" }).click();
    await page.waitForURL((u) => /\/platform\/addons\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/new"), { timeout: 30_000 });
    addonUrl = page.url();
    await page.getByRole("heading", { name: ADDON, level: 1 }).waitFor();
    await page.getByText("No company has this add-on yet.").waitFor();
  });

  if (COMPANY_ID) {
    await step("grant the add-on to a company (complimentary), then remove it", async () => {
      await page.goto(`${BASE}/console/companies/${COMPANY_ID}`);
      await page.getByText("Add-ons", { exact: true }).first().waitFor();
      await page.selectOption("#ca-addon", { label: ADDON });
      await page.fill("#ca-qty", "9");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await page.getByRole("alert").getByText("At most 4 units").waitFor({ timeout: 30_000 });
      await page.fill("#ca-qty", "2");
      await page.check("#ca-comp");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      const list = page.getByRole("list", { name: "Company add-ons" });
      await list.getByText(ADDON).waitFor({ timeout: 30_000 });
      await list.getByText("Complimentary").waitFor();
      const addonId = addonUrl.split("/").pop();
      await page.goto(`${BASE}/console/addons`);
      assert.equal((await page.getByTestId(`holders-${addonId}`).innerText()).trim(), "1");
      await page.goto(`${BASE}/console/companies/${COMPANY_ID}`);
      await page.getByRole("button", { name: `Remove ${ADDON}` }).click();
      await page.getByRole("button", { name: `Remove ${ADDON}` }).waitFor({ state: "detached", timeout: 30_000 });
    });
  } else {
    console.log("  - skipped company add-ons card (set TEST_COMPANY_ID)");
  }

  await step("deactivate the add-on", async () => {
    await page.goto(addonUrl);
    await page.getByRole("button", { name: "Deactivate add-on" }).click();
    await page.getByRole("button", { name: "Activate add-on" }).waitFor({ timeout: 30_000 });
  });

  await step("no horizontal scroll at phone width, no page errors", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const paths = ["/console/coupons", "/console/coupons/new", new URL(couponUrl).pathname, "/console/addons", "/console/addons/new", new URL(addonUrl).pathname];
    if (COMPANY_ID) paths.push(`/console/companies/${COMPANY_ID}`);
    for (const path of paths) {
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
