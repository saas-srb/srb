/**
 * Browser test for Revenue & subscriptions (/console/revenue) and the
 * revenue cards on the Platform Console dashboard, against a RUNNING server
 * (production build recommended). Works on an empty platform too: it checks
 * structure, range handling and exports, not specific amounts.
 *
 *   PANEL_BASE_URL=http://localhost:3006 OWNER_EMAIL=... OWNER_PASSWORD=... \
 *   node scripts/e2e/revenue.e2e.mjs
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.PANEL_BASE_URL ?? "http://localhost:3000";
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
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

try {
  await step("signed-out visitors can't reach revenue or its export", async () => {
    await page.goto(`${BASE}/console/revenue`);
    assert.ok(new URL(page.url()).pathname.endsWith("/commandos/login"), page.url());
    const res = await page.request.get(`${BASE}/console/revenue/export`, { maxRedirects: 0 });
    assert.notEqual(res.status(), 200, "export must not serve data signed out");
  });

  await step("owner signs in", async () => {
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 }), page.press('input[name="password"]', "Enter")]);
  });

  await step("dashboard keeps its KPIs and shows the revenue cards", async () => {
    await page.goto(`${BASE}/console`);
    await page.getByRole("heading", { name: "Dashboard" }).waitFor();
    await page.getByText("Trials ending in 7 days").waitFor();
    await page.getByText("Awaiting approval", { exact: true }).waitFor();
    const revenue = page.getByRole("region", { name: "Revenue" });
    for (const label of ["MRR", "ARR", "ARPA (monthly)", "Trials ending (7 days)", "Past due", "In grace period"]) await revenue.getByText(label, { exact: true }).waitFor();
    await page.click("[data-testid=dashboard-revenue-link]");
    await page.waitForURL((u) => u.pathname === "/console/revenue");
  });

  await step("revenue page renders every section", async () => {
    await page.getByRole("heading", { name: "Revenue & subscriptions", level: 1 }).waitFor();
    for (const label of ["MRR", "ARR", "Paying companies", "ARPA (monthly)", "On trial", "Net new MRR", "Trial → paid", "Logo churn", "Revenue churn", "Collected (incl. GST)", "GST collected"]) {
      await page.getByText(label, { exact: true }).first().waitFor();
    }
    for (const title of ["MRR over time", "Net new MRR", "Billed vs collected", "Plan & billing-cycle mix", "At-risk subscriptions", "By month"]) {
      await page.getByText(title, { exact: true }).first().waitFor();
    }
    assert.equal(await page.textContent("[data-testid=revenue-range-label]"), "Last 12 months");
    assert.equal(await page.locator("[data-testid=revenue-months] tbody tr").count(), 12);
  });

  await step("preset range changes the months shown", async () => {
    await page.getByRole("group", { name: "Date range" }).getByRole("button", { name: "Last 3 months" }).click();
    await page.waitForURL((u) => u.searchParams.get("range") === "3m");
    await page.locator("[data-testid=revenue-range-label]", { hasText: "Last 3 months" }).waitFor();
    assert.equal(await page.locator("[data-testid=revenue-months] tbody tr").count(), 3);
    assert.equal(await page.getByRole("button", { name: "Last 3 months" }).getAttribute("aria-pressed"), "true");
  });

  await step("custom month range", async () => {
    const now = new Date(Date.now() + 330 * 60_000);
    const key = (offset) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    };
    await page.getByRole("button", { name: "Custom" }).click();
    await page.fill("#revenue-from", key(-5));
    await page.fill("#revenue-to", key(-1));
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForURL((u) => u.searchParams.get("range") === "custom" && u.searchParams.get("from") === key(-5));
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=revenue-months] tbody tr").length === 5);
  });

  await step("CSV export follows the selected range", async () => {
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#revenue-export-months")]);
    assert.match(download.suggestedFilename(), /^revenue-\d{4}-\d{2}-to-\d{4}-\d{2}\.csv$/);
    const res = await page.request.get(`${BASE}/console/revenue/export?range=6m`);
    assert.equal(res.status(), 200);
    assert.match(res.headers()["content-type"] ?? "", /text\/csv/);
    const lines = (await res.text()).replace(/^﻿/, "").trim().split(/\r\n/);
    assert.match(lines[0], /^Month,MRR at month end/);
    assert.equal(lines.length, 7, "header + 6 months");
  });

  await step("companies CSV export", async () => {
    const res = await page.request.get(`${BASE}/console/revenue/export?kind=companies`);
    assert.equal(res.status(), 200);
    const text = (await res.text()).replace(/^﻿/, "");
    assert.match(text, /^Company,Slug,Status,Plan,Billing cycle,MRR,ARR/);
  });

  await step("old /console/revenue link lands on the product page", async () => {
    await page.goto(`${BASE}/console/revenue`);
    assert.equal(new URL(page.url()).pathname, "/console/revenue");
  });

  await step("no horizontal scroll at phone width, no page errors", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/console", "/console/revenue", "/console/revenue?range=24m"]) {
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => {
        const main = document.querySelector("main");
        return Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, main ? main.scrollWidth - main.clientWidth : 0);
      });
      assert.ok(overflow <= 1, `${path} scrolls horizontally by ${overflow}px`);
    }
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
