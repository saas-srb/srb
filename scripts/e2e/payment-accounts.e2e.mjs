/**
 * Browser e2e for Settings → Payments & payouts (a company's own Razorpay
 * account). Runs against an already-running app (ideally a production
 * build) — it starts nothing itself.
 *
 *   E2E_BASE_URL=http://alpha.localhost:3000 \
 *   E2E_OWNER_EMAIL=owner@alpha.test E2E_OWNER_PASSWORD=... \
 *     node scripts/e2e/payment-accounts.e2e.mjs
 *
 * E2E_BASE_URL must be the company's own workspace address and the account
 * that company's Super Admin (no forced password change pending). The server
 * needs PLATFORM_ENCRYPTION_KEY set. E2E_HEADED=1 to watch it run.
 *
 * It connects FAKE test keys, runs "Test connection" (which Razorpay rejects,
 * or which can't reach Razorpay offline — both are a failed test), then
 * disconnects. It refuses to run if the workspace already has an account
 * connected, so a real account is never replaced.
 */

import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = (process.env.E2E_BASE_URL ?? "").replace(/\/$/, "");
const EMAIL = process.env.E2E_OWNER_EMAIL;
const PASSWORD = process.env.E2E_OWNER_PASSWORD;
if (!BASE || !EMAIL || !PASSWORD) {
  console.error("Set E2E_BASE_URL, E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD.");
  process.exit(2);
}

const STAMP = String(Date.now()).slice(-8);
const KEY_ID = `rzp_test_E2E${STAMP}`;
const KEY_SECRET = `e2e-key-secret-${STAMP}`;
const WEBHOOK_SECRET = `e2e-webhook-${STAMP}`;
const ACCOUNT_NUMBER = `7000${STAMP}`;

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
    throw err;
  }
}

const browser = await chromium.launch({ channel: "chrome", headless: !process.env.E2E_HEADED });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); // phone width
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(err.message));

const status = () => page.locator("#payment-account-status");
const notice = () => page.locator("#pay-notice");
let weConnected = false;

/** Clicks and waits for the server action's response, so an older notice can't be mistaken for this one. */
async function withAction(click) {
  const done = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
  await click();
  await done;
}

try {
  await step("signs in as the company owner", async () => {
    await page.goto(`${BASE}/commandos/login`);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/commandos/login"));
    assert.ok(!page.url().includes("/change-password"), "account has a forced password change pending");
  });

  await step("settings hub links to Payments & payouts", async () => {
    await page.goto(`${BASE}/commandos/settings`);
    await page.getByRole("link", { name: /Payments & payouts/ }).click();
    await page.waitForURL(/\/workspace\/settings\/payments$/);
    await status().waitFor();
  });

  await step("starts not connected (refuses to touch a connected account)", async () => {
    const text = await status().innerText();
    assert.ok(/Not connected/.test(text), "this workspace already has a Razorpay account connected — use a test workspace");
    assert.equal(await page.locator("#pay-test").count(), 0, "Test connection shown without an account");
    const enc = await page.getByText(/Secure storage for payment keys isn't set up/).count();
    assert.equal(enc, 0, "server has no PLATFORM_ENCRYPTION_KEY");
  });

  await step("shows per-company webhook URLs to paste into Razorpay", async () => {
    const payments = await page.getByTestId("url-payments").innerText();
    const payouts = await page.getByTestId("url-payouts").innerText();
    assert.match(payments, /^https?:\/\/[^/]+\/api\/fms\/webhooks\/razorpay\/[A-Za-z0-9_-]+$/);
    assert.match(payouts, /^https?:\/\/[^/]+\/api\/hrms\/payroll\/webhook\/[A-Za-z0-9_-]+$/);
    assert.equal(payments.split("/").pop(), payouts.split("/").pop(), "same company id in both");
    await page.getByRole("button", { name: "Copy payments webhook URL" }).waitFor();
  });

  await step("validates the form before saving", async () => {
    await page.locator("#pay-submit").click();
    await page.locator("#pay-keyId-error").waitFor();
    await page.locator("#pay-keySecret-error").waitFor();
    await page.locator("#pay-keyId").fill("not-a-key");
    await page.locator("#pay-submit").click();
    await page.locator("#pay-keyId-error").filter({ hasText: /rzp_test_ or rzp_live_/ }).waitFor();
    await page.locator("#pay-payoutsEnabled").check();
    await page.locator("#pay-submit").click();
    await page.locator("#pay-accountNumber-error").waitFor();
  });

  await step("connects test keys; secrets are shown as last 4 only", async () => {
    await page.locator("#pay-keyId").fill(KEY_ID);
    await page.locator("#pay-keySecret").fill(KEY_SECRET);
    await page.locator("#pay-webhookSecret").fill(WEBHOOK_SECRET);
    await page.locator("#pay-accountNumber").fill(ACCOUNT_NUMBER);
    await withAction(() => page.locator("#pay-submit").click());
    weConnected = true;
    await notice().filter({ hasText: /Razorpay connected/ }).waitFor();
    await status().getByText("Connected", { exact: true }).waitFor();
    await status().getByText("Test mode").waitFor();
    await status().getByText("Payouts on").waitFor();
    assert.equal(await page.getByTestId("stored-key-id").innerText(), KEY_ID);
    assert.equal(await page.getByTestId("stored-key-secret").innerText(), `••••${KEY_SECRET.slice(-4)}`);
    assert.equal(await page.getByTestId("stored-webhook-secret").innerText(), `••••${WEBHOOK_SECRET.slice(-4)}`);
    assert.equal(await page.getByTestId("stored-account-number").innerText(), `••••${ACCOUNT_NUMBER.slice(-4)}`);
    assert.equal(await page.locator("#pay-keySecret").inputValue(), "", "secret input cleared");
  });

  await step("after a reload the page source never contains a secret", async () => {
    await page.reload();
    await status().getByText("Connected", { exact: true }).waitFor();
    const html = await page.content();
    for (const s of [KEY_SECRET, WEBHOOK_SECRET, ACCOUNT_NUMBER]) assert.ok(!html.includes(s), "secret found in the page");
    assert.match(await page.locator("#pay-keySecret").getAttribute("placeholder"), /Leave blank to keep/);
  });

  await step("Test connection with fake keys fails clearly and is recorded", async () => {
    await withAction(() => page.locator("#pay-test").click());
    await page.getByRole("alert").filter({ hasText: /Razorpay rejected these keys|Couldn't reach Razorpay|unexpected status/ }).waitFor();
    await status().getByText(/^Failed ·/).waitFor();
  });

  await step("saving without re-entering secrets keeps them", async () => {
    await page.locator("#pay-payoutsEnabled").uncheck();
    await withAction(() => page.locator("#pay-submit").click());
    await notice().filter({ hasText: /settings saved/ }).waitFor();
    await status().getByText("Payouts off").waitFor();
    assert.equal(await page.getByTestId("stored-key-secret").innerText(), `••••${KEY_SECRET.slice(-4)}`);
  });

  await step("disconnect asks for confirmation; cancel keeps it", async () => {
    await page.locator("#pay-disconnect").click();
    const confirm = page.getByRole("group", { name: "Confirm disconnecting Razorpay" });
    await confirm.waitFor();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await confirm.waitFor({ state: "detached" });
    await status().getByText("Connected", { exact: true }).waitFor();
  });

  await step("disconnects and stays disconnected after reload", async () => {
    await page.locator("#pay-disconnect").click();
    await withAction(() => page.locator("#pay-disconnect-confirm").click());
    await notice().filter({ hasText: /disconnected/ }).waitFor();
    weConnected = false;
    await status().getByText("Not connected").waitFor();
    await page.reload();
    await status().getByText("Not connected").waitFor();
  });

  await step("no horizontal scroll at phone width, no page errors", async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `page scrolls horizontally by ${overflow}px`);
    assert.deepEqual(pageErrors, []);
  });
} catch {
  // Already reported by step(); fall through to cleanup and summary.
} finally {
  // Best-effort cleanup: never leave the fake keys connected.
  if (weConnected) {
    try {
      await page.goto(`${BASE}/commandos/settings/payments`);
      await page.locator("#pay-disconnect").click();
      await withAction(() => page.locator("#pay-disconnect-confirm").click());
      await status().getByText("Not connected").waitFor({ timeout: 10_000 });
    } catch {
      console.log("  (could not disconnect the e2e test keys; disconnect them in Settings → Payments & payouts)");
    }
  }
  await browser.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
