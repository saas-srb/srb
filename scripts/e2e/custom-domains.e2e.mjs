/**
 * Browser e2e for Settings → Domains. Runs against an already-running app
 * (ideally a production build) — it starts nothing itself.
 *
 *   E2E_BASE_URL=http://alpha.localhost:3000 \
 *   E2E_OWNER_EMAIL=owner@alpha.test E2E_OWNER_PASSWORD=... \
 *     node scripts/e2e/custom-domains.e2e.mjs
 *
 * E2E_BASE_URL must be the company's own workspace address and the account
 * that company's Super Admin (with no forced password change pending).
 * Optional: E2E_ROOT_DOMAIN (defaults to the base URL's host minus its first
 * label — the platform root), E2E_HEADED=1 to watch it run.
 *
 * It adds and then removes a throwaway domain (`e2e-<timestamp>.example.com`);
 * nothing else in the workspace is changed.
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
const baseHost = new URL(BASE).hostname;
const ROOT = process.env.E2E_ROOT_DOMAIN ?? (baseHost.split(".").length > 1 ? baseHost.split(".").slice(1).join(".") : baseHost);
const DOMAIN = `e2e-${Date.now()}.example.com`;

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

const domainInput = () => page.getByLabel("Add a domain");
const addButton = () => page.getByRole("button", { name: "Add domain" });
const row = (host) => page.locator(`li[data-domain="${host}"]`);

/** Submits the add form and waits for the server action's response (so a previous alert can't be mistaken for this one). */
async function addDomain(host) {
  await domainInput().fill(host);
  const done = page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
  await addButton().click();
  await done;
}
const addAlert = (text) => page.getByRole("alert").filter({ hasText: text }).waitFor();

try {
  await step("signs in as the company owner", async () => {
    await page.goto(`${BASE}/commandos/login`);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/commandos/login"));
    assert.ok(!page.url().includes("/change-password"), "account has a forced password change pending");
  });

  await step("settings hub links to Domains", async () => {
    await page.goto(`${BASE}/commandos/settings`);
    await page.getByRole("link", { name: /Domains/ }).click();
    await page.waitForURL(/\/workspace\/settings\/domains$/);
    await page.getByText("Domains", { exact: true }).first().waitFor();
  });

  await step("lists the automatic workspace address, which can't be removed", async () => {
    const auto = page.locator("li[data-domain]").first();
    await auto.getByText("Workspace address").waitFor();
    assert.equal(await auto.getByRole("button", { name: /^Remove / }).count(), 0);
  });

  await step("rejects an invalid host", async () => {
    await addDomain("not a domain");
    await addAlert(/doesn't look like a domain/);
    await addDomain("192.168.1.10");
    await addAlert(/IP address/);
  });

  await step("rejects the platform root domain and its subdomains", async () => {
    for (const host of [ROOT, `someone-else.${ROOT}`]) {
      await addDomain(host);
      // "Platform addresses …", or for a localhost root "Use a domain you own …".
      await addAlert(/Platform addresses|Use a domain you own/);
      assert.equal(await row(host).count(), 0, `${host} was added`);
    }
  });

  await step("adds a custom domain as pending, with DNS instructions", async () => {
    await addDomain(DOMAIN);
    await row(DOMAIN).waitFor();
    await page.getByRole("status").filter({ hasText: `Added ${DOMAIN}` }).waitFor();
    assert.equal(await domainInput().inputValue(), "", "input cleared");
    const r = row(DOMAIN);
    await r.getByText("Pending verification").waitFor();
    await r.getByText("Custom domain").waitFor();
    const records = r.getByRole("list", { name: `DNS records for ${DOMAIN}` });
    await records.getByText(`_selfrun-verify.${DOMAIN}`).waitFor();
    await records.getByText(/^demo-verify=[0-9a-f]{32}$/).waitFor();
    // Routing record: CNAME for a subdomain like this one (or whatever the provider asked for).
    await records.getByText(/^(CNAME|A)$/).first().waitFor();
    assert.equal(await r.getByRole("button", { name: `Make ${DOMAIN} primary` }).count(), 0, "pending domain offered as primary");
  });

  await step("adding it again is refused", async () => {
    await addDomain(DOMAIN);
    await addAlert(/already added/);
  });

  await step("Check now reports it isn't verified yet", async () => {
    await row(DOMAIN).getByRole("button", { name: `Check ${DOMAIN} now` }).click();
    await page.getByRole("alert").filter({ hasText: `${DOMAIN} isn't verified yet` }).waitFor();
    await row(DOMAIN).getByText("Pending verification").waitFor();
  });

  await step("survives a reload", async () => {
    await page.reload();
    await row(DOMAIN).getByText("Pending verification").waitFor();
  });

  await step("remove asks for confirmation, and cancel keeps it", async () => {
    await row(DOMAIN).getByRole("button", { name: `Remove ${DOMAIN}` }).click();
    const confirm = page.getByRole("group", { name: `Confirm removing ${DOMAIN}` });
    await confirm.waitFor();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await confirm.waitFor({ state: "detached" });
    await row(DOMAIN).waitFor();
  });

  await step("removes the domain", async () => {
    await row(DOMAIN).getByRole("button", { name: `Remove ${DOMAIN}` }).click();
    await page.getByRole("group", { name: `Confirm removing ${DOMAIN}` }).getByRole("button", { name: "Yes, remove" }).click();
    await row(DOMAIN).waitFor({ state: "detached" });
    await page.reload();
    assert.equal(await row(DOMAIN).count(), 0, "domain came back after reload");
  });

  await step("no horizontal scroll at phone width, no page errors", async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `page scrolls horizontally by ${overflow}px`);
    assert.deepEqual(pageErrors, []);
  });
} catch {
  // Already reported by step(); fall through to cleanup and summary.
} finally {
  // Best-effort cleanup if a step failed after the domain was added.
  try {
    const leftover = row(DOMAIN);
    if (await leftover.count()) {
      await leftover.getByRole("button", { name: `Remove ${DOMAIN}` }).click();
      await page.getByRole("button", { name: "Yes, remove" }).click();
      await leftover.waitFor({ state: "detached", timeout: 10_000 });
    }
  } catch {
    console.log(`  (could not clean up ${DOMAIN}; remove it from Settings → Domains)`);
  }
  await browser.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
