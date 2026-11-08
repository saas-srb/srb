/**
 * Browser test for Platform Console → Plans & pricing and the company page's
 * extend-trial card, against a RUNNING server (production build recommended)
 * on a scratch database. Creates a plan with a unique id each run.
 *
 *   PANEL_BASE_URL=http://localhost:3006 OWNER_EMAIL=... OWNER_PASSWORD=... \
 *   [TRIAL_COMPANY_ID=<id of a company on trial>] node scripts/e2e/plans.e2e.mjs
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.PANEL_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.OWNER_EMAIL;
const PASSWORD = process.env.OWNER_PASSWORD;
const TRIAL_COMPANY_ID = process.env.TRIAL_COMPANY_ID;
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

const planId = `e2e-${Date.now().toString(36)}`;
const planName = `E2E ${planId}`;
const card = (page) => page.locator(`li[data-plan-id="${planId}"]`);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

try {
  await step("owner signs in", async () => {
    await page.goto(`${BASE}/console/plans`);
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 }), page.press('input[name="password"]', "Enter")]);
    await page.goto(`${BASE}/console/plans`);
    await page.getByRole("heading", { name: "Plans & pricing", level: 1 }).waitFor();
    await page.getByRole("list", { name: "Plans" }).waitFor();
  });

  await step("create form validates", async () => {
    await page.click("#plan-new");
    await page.getByRole("heading", { name: "New plan", level: 1 }).waitFor();
    await page.fill("#plan-id", "trial");
    await page.click("#plan-save");
    await page.getByText("is reserved").waitFor({ timeout: 30_000 });
    await page.getByText("Give the plan a name.").waitFor();
  });

  await step("create a plan: monthly only, products, flag, highlight, custom limit, default trial", async () => {
    await page.fill("#plan-id", planId);
    await page.fill("#plan-name", planName);
    await page.fill("#plan-description", "Created by the browser test");
    await page.fill("#plan-price-monthly", "1499");
    await page.uncheck("#plan-cycle-yearly");
    await page.check('input[name="module"][value="hrms"]');
    await page.check('input[name="module"][value="pms"]');
    await page.check('input[name="flag"][value="apiAccess"]');
    await page.fill("#plan-highlights", "Unlimited projects\nPriority onboarding");
    await page.fill("#plan-limit-seats", "15");
    await page.getByRole("button", { name: "Add limit" }).click();
    await page.fill("#plan-custom-key-0", "projects");
    await page.fill("#plan-custom-value-0", "25");
    await page.click("#plan-save");
    await page.waitForURL((u) => u.pathname === "/console/plans", { timeout: 60_000 });
    const c = card(page);
    await c.waitFor();
    await c.getByText("Not offered").waitFor();
    await c.getByText("(platform default)").waitFor();
    await c.getByText("Unlimited projects").waitFor();
    await c.getByText("API access").waitFor();
    await c.getByText("v1", { exact: true }).waitFor();
  });

  await step("a price change creates a new price version", async () => {
    await card(page).getByRole("link", { name: `Edit ${planName}` }).click();
    await page.getByRole("heading", { name: `Edit ${planName}`, level: 1 }).waitFor();
    assert.equal(await page.inputValue("#plan-custom-key-0"), "projects");
    assert.equal(await page.inputValue("#plan-trialDays"), "");
    await page.fill("#plan-price-monthly", "1999");
    await page.getByText("Saving creates a new price version").waitFor();
    await page.click("#plan-save");
    await page.waitForURL((u) => u.pathname === "/console/plans", { timeout: 60_000 });
    await card(page).getByText("v2", { exact: true }).waitFor();
    await card(page).getByRole("link", { name: `Edit ${planName}` }).click();
    const history = page.getByRole("list", { name: "Price versions" });
    await history.getByText("v1", { exact: true }).waitFor();
    await history.getByText("v2", { exact: true }).waitFor();
    await history.getByText("Current").waitFor();
    await page.goto(`${BASE}/console/plans`);
  });

  await step("reorder: move the new plan up one place", async () => {
    const ids = async () => page.locator("li[data-plan-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-plan-id")));
    const before = await ids();
    const at = before.indexOf(planId);
    assert.ok(at > 0, "new plan should not be first");
    await card(page).getByRole("button", { name: `Move ${planName} up` }).click();
    await page.waitForFunction(([id, idx]) => [...document.querySelectorAll("li[data-plan-id]")].map((e) => e.getAttribute("data-plan-id")).indexOf(id) === idx, [planId, at - 1], { timeout: 30_000 });
  });

  await step("make default, then hand the default back", async () => {
    const previous = await page.locator("li[data-plan-id]").filter({ has: page.getByText("Default", { exact: true }) }).first().getAttribute("data-plan-id");
    await card(page).getByRole("button", { name: `Make ${planName} the default` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Make default" }).click();
    await card(page).getByText("Default", { exact: true }).waitFor({ timeout: 30_000 });
    assert.equal(await card(page).getByRole("button", { name: `Deactivate ${planName}` }).count(), 0, "default can't be deactivated");
    const prev = page.locator(`li[data-plan-id="${previous}"]`);
    await prev.getByRole("button", { name: /^Make .* the default$/ }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Make default" }).click();
    await prev.getByText("Default", { exact: true }).waitFor({ timeout: 30_000 });
  });

  await step("deactivate and reactivate", async () => {
    await card(page).getByRole("button", { name: `Deactivate ${planName}` }).click();
    await page.getByRole("alertdialog").getByText("No company is on it").waitFor();
    await page.getByRole("alertdialog").getByRole("button", { name: "Deactivate" }).click();
    await card(page).getByText("Inactive", { exact: true }).waitFor({ timeout: 30_000 });
    await card(page).getByRole("button", { name: `Activate ${planName}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Activate" }).click();
    await card(page).getByText("Active", { exact: true }).waitFor({ timeout: 30_000 });
  });

  await step("delete the unused plan", async () => {
    await card(page).getByRole("button", { name: `Delete ${planName}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete plan" }).click();
    await card(page).waitFor({ state: "detached", timeout: 30_000 });
  });

  if (TRIAL_COMPANY_ID) {
    await step("extend a company's trial from its page", async () => {
      await page.goto(`${BASE}/console/companies/${TRIAL_COMPANY_ID}`);
      await page.getByText("Subscription & trial").waitFor();
      await page.fill("#trial-extend-days", "0");
      await page.click("#trial-extend");
      await page.getByRole("alert").filter({ hasText: "Enter 1–365 days." }).waitFor({ timeout: 30_000 });
      await page.fill("#trial-extend-days", "3");
      await page.click("#trial-extend");
      await page.getByText(/Trial extended to/).waitFor({ timeout: 30_000 });
    });
  }

  await step("no horizontal scroll at phone width, no page errors", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/console/plans", "/console/plans/new", "/console/plans/growth", ...(TRIAL_COMPANY_ID ? [`/console/companies/${TRIAL_COMPANY_ID}`] : [])]) {
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
