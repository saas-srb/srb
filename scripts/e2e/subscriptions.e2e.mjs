/**
 * Browser test for Payments & Razorpay, Subscriptions (Platform Console) and a
 * company's /commandos/settings/billing, against a RUNNING server (production build
 * recommended). No real checkout: it never clicks Subscribe, and it never
 * saves Razorpay keys (it only checks validation of an obviously wrong key).
 *
 *   PANEL_BASE_URL=http://localhost:3006 OWNER_EMAIL=... OWNER_PASSWORD=... \
 *   COMPANY_URL=http://acme.localhost:3006 COMPANY_EMAIL=... COMPANY_PASSWORD=... \
 *   node scripts/e2e/subscriptions.e2e.mjs
 *
 * COMPANY_* are optional (a non-owner company's Super Admin); without them the
 * company billing steps are skipped.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.PANEL_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.OWNER_EMAIL;
const PASSWORD = process.env.OWNER_PASSWORD;
const COMPANY_URL = process.env.COMPANY_URL;
const COMPANY_EMAIL = process.env.COMPANY_EMAIL;
const COMPANY_PASSWORD = process.env.COMPANY_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Set OWNER_EMAIL and OWNER_PASSWORD.");
  process.exit(2);
}

let passed = 0;
let skipped = 0;
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

async function signIn(page, base, email, password) {
  await page.goto(`${base}/commandos/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 }), page.press('input[name="password"]', "Enter")]);
}

async function noHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `page scrolls horizontally by ${overflow}px`);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const pageErrors = [];

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await step("owner signs in", async () => {
    await signIn(page, BASE, EMAIL, PASSWORD);
  });

  await step("Payments & Razorpay renders keys, webhook URL and events", async () => {
    await page.goto(`${BASE}/console/payments`);
    await page.getByRole("heading", { name: "Payments & Razorpay", level: 1 }).waitFor();
    await page.locator("#rzp-key-id").waitFor();
    await page.locator("#rzp-key-secret").waitFor();
    assert.equal(await page.locator("#rzp-key-secret").inputValue(), "", "secret field is never prefilled");
    const url = (await page.locator("#billing-webhook-url").textContent())?.trim() ?? "";
    assert.ok(url.endsWith("/api/platform/billing/webhook"), url);
    await page.getByText(/Webhook secret is (set|not set)/).first().waitFor();
    await page.getByText("Recent payments & webhook events").waitFor();
    await page.getByRole("button", { name: "Test connection" }).waitFor();
  });

  await step("a mismatched key id is rejected without saving", async () => {
    const before = await page.locator("#rzp-key-id").inputValue();
    await page.locator("#rzp-key-id").fill("not-a-key");
    await page.getByRole("button", { name: "Save keys" }).click();
    await page.getByText("Enter a Razorpay key id").waitFor();
    await page.locator("#rzp-key-id").fill(before);
  });

  await step("Payments page has no secrets in the HTML", async () => {
    const html = await page.content();
    assert.ok(!/"keySecret"\s*:\s*\{/.test(html), "ciphertext leaked");
    assert.ok(!/RAZORPAY_BILLING_WEBHOOK_SECRET=/.test(html));
  });

  let firstCompanyHref = null;
  await step("Subscriptions lists companies with plan, status and MRR", async () => {
    await page.goto(`${BASE}/console/subscriptions`);
    await page.getByRole("heading", { name: "Subscriptions", level: 1 }).waitFor();
    await page.getByText("MRR (pre-tax)").waitFor();
    for (const col of ["Company", "Plan", "Cycle", "Status", "Trial ends", "Renews", "MRR"]) await page.getByRole("columnheader", { name: col }).first().waitFor();
    firstCompanyHref = await page.locator('a[href^="/console/subscriptions/"]').first().getAttribute("href");
    assert.ok(firstCompanyHref, "at least one row");
  });

  await step("status filter and search update the URL", async () => {
    await page.locator("#subscriptions-search").fill("zzzz-no-such-company");
    await page.waitForURL((u) => u.searchParams.get("q") === "zzzz-no-such-company", { timeout: 10_000 });
    await page.getByText("No subscriptions match these filters.").waitFor();
    await page.goto(`${BASE}/console/subscriptions?status=trialing`);
    await page.getByRole("heading", { name: "Subscriptions", level: 1 }).waitFor();
  });

  await step("subscription detail shows history, audit and actions", async () => {
    await page.goto(`${BASE}${firstCompanyHref}`);
    await page.getByText("Subscription history").first().waitFor();
    await page.getByText("Audit", { exact: true }).waitFor();
    const owner = await page.getByText("The platform owner company is never billed.").count();
    if (!owner) {
      await page.getByText("Manage subscription").waitFor();
      await page.getByRole("button", { name: /Mark complimentary|Remove complimentary/ }).waitFor();
    }
  });

  await step("product pages fit a 390px screen", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/console/payments", "/console/subscriptions", firstCompanyHref]) {
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState("networkidle");
      await noHorizontalScroll(page);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  await context.close();

  if (COMPANY_URL && COMPANY_EMAIL && COMPANY_PASSWORD) {
    const cctx = await browser.newContext();
    const cpage = await cctx.newPage();
    cpage.on("pageerror", (e) => pageErrors.push(e.message));

    await step("company billing page shows plan, status and a quote-priced summary", async () => {
      await signIn(cpage, COMPANY_URL, COMPANY_EMAIL, COMPANY_PASSWORD);
      await cpage.goto(`${COMPANY_URL}/commandos/settings/billing`);
      await cpage.getByRole("heading", { name: "Current plan" }).waitFor();
      await cpage.locator("#billing-total").waitFor({ timeout: 20_000 });
      const total = (await cpage.locator("#billing-total").textContent()) ?? "";
      assert.match(total, /₹/);
      await cpage.getByRole("radio", { name: "Yearly" }).click();
      await cpage.getByText("Total per year").waitFor();
    });

    await step("an unknown coupon shows the quote's coupon error", async () => {
      await cpage.locator("#billing-coupon").fill("NO-SUCH-COUPON-E2E");
      await cpage.getByRole("button", { name: "Apply" }).click();
      await cpage.locator("#billing-coupon-error").waitFor({ timeout: 20_000 });
      assert.ok(await cpage.locator("#billing-submit").isDisabled(), "cannot subscribe with an invalid coupon");
      await cpage.getByRole("button", { name: "Remove" }).click();
    });

    await step("GST billing details form validates", async () => {
      await cpage.getByRole("form", { name: "Billing details" }).waitFor();
      await cpage.locator("#billing-gstin").fill("12345");
      await cpage.getByRole("button", { name: "Save billing details" }).click();
      await cpage.locator("#billing-gstin-error").waitFor();
    });

    await step("company billing page fits a 390px screen", async () => {
      await cpage.setViewportSize({ width: 390, height: 844 });
      await cpage.reload();
      await cpage.getByRole("heading", { name: "Current plan" }).waitFor();
      await noHorizontalScroll(cpage);
    });

    await step("the Platform Console doesn't exist on the company's host", async () => {
      const res = await cpage.goto(`${COMPANY_URL}/console/subscriptions`);
      assert.equal(res?.status(), 404);
    });
    await cctx.close();
  } else {
    skipped += 5;
    console.log("  - company billing steps skipped (set COMPANY_URL, COMPANY_EMAIL, COMPANY_PASSWORD)");
  }

  await step("no uncaught page errors", async () => {
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failures.length} failed${skipped ? `, ${skipped} skipped` : ""}`);
if (failures.length) process.exit(1);
