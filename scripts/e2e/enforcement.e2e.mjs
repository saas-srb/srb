/**
 * Browser test for plan enforcement (module gating, upgrade page, billing
 * banner, locked Staff Hub tiles) and the Platform Console "Usage & limits"
 * page, against a RUNNING server (production build recommended).
 *
 *   PANEL_BASE_URL=http://localhost:3006 OWNER_EMAIL=... OWNER_PASSWORD=... \
 *   [TEST_COMPANY_URL=http://acme.localhost:3006 TEST_COMPANY_EMAIL=... TEST_COMPANY_PASSWORD=... \
 *    LOCKED_MODULE=fms] \
 *   node scripts/e2e/enforcement.e2e.mjs
 *
 * The optional TEST_COMPANY_* company must be a Super Admin login on a
 * company whose plan does NOT include LOCKED_MODULE (default "fms", e.g. the
 * Starter plan) and that is trialing (so the banner shows).
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.PANEL_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.OWNER_EMAIL;
const PASSWORD = process.env.OWNER_PASSWORD;
const COMPANY_URL = process.env.TEST_COMPANY_URL;
const COMPANY_EMAIL = process.env.TEST_COMPANY_EMAIL;
const COMPANY_PASSWORD = process.env.TEST_COMPANY_PASSWORD;
const LOCKED = process.env.LOCKED_MODULE ?? "fms";
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

async function signIn(page, origin, email, password) {
  await page.goto(`${origin}/commandos/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 }), page.press('input[name="password"]', "Enter")]);
  await skipSetupIfShown(page);
}

/** A company whose setup is still open lands in the onboarding wizard first; skipping it is the way into the dashboard. */
async function skipSetupIfShown(page) {
  if (new URL(page.url()).pathname !== "/commandos/onboarding") return;
  await Promise.all([page.waitForURL((u) => u.pathname === "/commandos", { timeout: 30_000 }), page.getByRole("button", { name: "Skip for now" }).click()]);
}

async function noHorizontalScroll(page, url) {
  await page.goto(url);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${url} scrolls horizontally by ${overflow}px`);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const pageErrors = [];

try {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await step("owner signs in", async () => {
    await signIn(page, BASE, EMAIL, PASSWORD);
  });

  await step("Usage & limits page lists companies with plan, seats, AI tokens, storage", async () => {
    await page.goto(`${BASE}/console/usage`);
    await page.getByRole("heading", { name: "Usage & limits", level: 1 }).waitFor();
    await page.locator("#usage-count").waitFor();
    const table = page.locator("#usage-table");
    await table.waitFor();
    for (const h of ["Company", "Plan", "Seats", "AI tokens", "Storage"]) await table.getByRole("columnheader", { name: h }).first().waitFor();
    assert.ok((await table.locator("tbody tr").count()) >= 1, "at least one company row");
    // The platform owner is internal: never over a limit.
    assert.ok((await table.getByText("Platform owner").count()) >= 1, "owner row shows internal status");
  });

  await step("search filters rows; sort toggles; level filter works", async () => {
    const rows = page.locator("#usage-table tbody tr");
    const total = await rows.count();
    await page.fill("#usage-search", "zzzz-no-such-company");
    await page.getByText("No companies match these filters.").waitFor();
    await page.fill("#usage-search", "");
    await page.waitForFunction((n) => document.querySelectorAll("#usage-table tbody tr").length === n, total);
    await page.click("#usage-sort-ai");
    await page.click("#usage-sort-ai");
    await page.click("#usage-level-filter");
    await page.getByRole("option", { name: "Over or near" }).click();
    const shown = await rows.count();
    const levels = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-level")));
    assert.ok(levels.every((l) => l === "over" || l === "near"), `only flagged rows (${levels.join(",")})`);
    assert.ok(shown <= total);
    await page.click("#usage-level-filter");
    await page.getByRole("option", { name: "All companies" }).click();
  });

  await step("CSV export downloads a file with the header row", async () => {
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#usage-export-csv")]);
    assert.match(download.suggestedFilename(), /^usage-\d{4}-\d{2}\.csv$/);
    const path = await download.path();
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(path, "utf8");
    assert.match(text.split("\r\n")[0], /^Company,Slug,Plan,Status,Seats used,Seat limit/);
  });

  await step("owner workspace: no product is locked and no billing banner", async () => {
    await page.goto(`${BASE}/commandos`);
    await page.getByText("My Operational Products").waitFor();
    assert.equal(await page.locator('[data-locked="true"]').count(), 0);
    assert.equal(await page.locator("#billing-notice").count(), 0);
    const res = await page.goto(`${BASE}/${LOCKED}`);
    assert.ok(res && res.status() < 400);
    assert.ok(!new URL(page.url()).pathname.startsWith("/commandos/upgrade"), `owner was sent to ${page.url()}`);
  });

  await step("owner pages: no horizontal scroll at phone width", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await noHorizontalScroll(page, `${BASE}/console/usage`);
    await page.locator('[data-company]').first().waitFor();
    await page.setViewportSize({ width: 1280, height: 800 });
  });
  await ctx.close();

  if (COMPANY_URL && COMPANY_EMAIL && COMPANY_PASSWORD) {
    const cctx = await browser.newContext();
    const cp = await cctx.newPage();
    cp.on("pageerror", (e) => pageErrors.push(e.message));

    await step("company Super Admin signs in", async () => {
      await signIn(cp, COMPANY_URL, COMPANY_EMAIL, COMPANY_PASSWORD);
    });

    await step(`Staff Hub marks ${LOCKED} as locked`, async () => {
      await cp.goto(`${COMPANY_URL}/commandos`);
      await cp.getByText("My Operational Products").waitFor();
      const tile = cp.locator(`[data-module="${LOCKED}"]`);
      if ((await tile.count()) > 0) {
        assert.equal(await tile.getAttribute("data-locked"), "true");
        await tile.getByText("Upgrade to unlock").waitFor();
        assert.match((await tile.locator("a").first().getAttribute("href")) ?? "", new RegExp(`/commandos/upgrade\\?module=${LOCKED}$`));
      }
    });

    await step("trial banner shows days left and links to billing", async () => {
      const notice = cp.locator("#billing-notice");
      await notice.waitFor();
      assert.equal(await notice.getAttribute("data-status"), "trialing");
      await notice.getByText(/day|ends today/).first().waitFor();
      assert.equal(await notice.getByRole("link").getAttribute("href"), "/commandos/settings/billing");
    });

    await step(`opening /${LOCKED} shows the upgrade page`, async () => {
      await cp.goto(`${COMPANY_URL}/${LOCKED}`);
      await cp.waitForURL((u) => u.pathname === "/commandos/upgrade", { timeout: 30_000 });
      assert.equal(new URL(cp.url()).searchParams.get("module"), LOCKED);
      const title = cp.locator("#upgrade-title");
      await title.waitFor();
      assert.match((await title.textContent()) ?? "", /^Upgrade to unlock /);
      assert.equal(await cp.locator("#upgrade-billing-link").getAttribute("href"), "/commandos/settings/billing");
    });

    await step("included products still open normally", async () => {
      await cp.goto(`${COMPANY_URL}/talentos`);
      assert.ok(!new URL(cp.url()).pathname.startsWith("/commandos/upgrade"), cp.url());
    });

    await step("upgrade page and workspace: no horizontal scroll at phone width", async () => {
      await cp.setViewportSize({ width: 390, height: 844 });
      await noHorizontalScroll(cp, `${COMPANY_URL}/commandos/upgrade?module=${LOCKED}`);
      await noHorizontalScroll(cp, `${COMPANY_URL}/commandos`);
    });
    await cctx.close();
  } else {
    console.log("  (skipping company-side checks: set TEST_COMPANY_URL, TEST_COMPANY_EMAIL, TEST_COMPANY_PASSWORD)");
  }

  await step("no page errors", async () => {
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
