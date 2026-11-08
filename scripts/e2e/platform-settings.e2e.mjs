/**
 * Browser test for Platform Console → Domains & SSL, Integrations and Platform
 * settings, against a RUNNING server (production build recommended) whose
 * database is a throwaway test DB — it saves settings.
 *
 *   PANEL_BASE_URL=http://localhost:3006 OWNER_EMAIL=... OWNER_PASSWORD=... \
 *   node scripts/e2e/platform-settings.e2e.mjs
 *
 * The integrations step saves a dummy Resend key and then removes it again;
 * it needs PLATFORM_ENCRYPTION_KEY set on the server (skipped otherwise).
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
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

try {
  await step("owner signs in", async () => {
    await page.goto(`${BASE}/console`);
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 }), page.press('input[name="password"]', "Enter")]);
    await page.goto(`${BASE}/console`);
    await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  });

  await step("Domains & SSL lists every company's domains", async () => {
    await page.goto(`${BASE}/console/domains`);
    await page.getByRole("heading", { name: "Domains & SSL", level: 1 }).waitFor();
    await page.getByText("Pending verification").first().waitFor();
    await page.locator("#domains-search").waitFor();
    const rows = page.locator("tbody tr");
    await rows.first().waitFor();
    assert.ok((await page.getByRole("button", { name: /^Actions for / }).count()) > 0, "row actions present");
  });

  await step("domain search filters by company or host", async () => {
    await page.locator("#domains-search").fill("zz-no-such-domain-zz");
    await page.waitForURL((u) => u.searchParams.get("q") === "zz-no-such-domain-zz", { timeout: 10_000 });
    await page.getByText("No domains match these filters.").waitFor();
  });

  await step("re-check a domain from the row menu", async () => {
    await page.goto(`${BASE}/console/domains`);
    await page.getByRole("button", { name: /^Actions for / }).first().click();
    await page.getByRole("menuitem", { name: "Re-check DNS & SSL" }).click();
    // Either outcome is a toast (verified, or not yet with the reason).
    await page.locator("[data-sonner-toast]").first().waitFor({ timeout: 30_000 });
  });

  await step("company page still shows its domains with actions", async () => {
    await page.goto(`${BASE}/console/companies`);
    await page.locator('a[href^="/console/companies/"]').first().click();
    await page.getByText("Domains", { exact: true }).waitFor();
    await page.getByRole("link", { name: "All domains" }).waitFor();
  });

  await step("integrations page renders effective config", async () => {
    await page.goto(`${BASE}/console/integrations`);
    await page.getByRole("heading", { name: "Integrations", level: 1 }).waitFor();
    await page.locator("#int-email-provider").waitFor();
    await page.locator("#int-vercel-project").waitFor();
    await page.locator("#int-resend-key-status").waitFor();
  });

  await step("integrations save a key and show only its last 4", async () => {
    if (await page.locator("#int-resend-key").isDisabled()) {
      console.log("      (skipped: PLATFORM_ENCRYPTION_KEY not set on the server)");
      return;
    }
    const before = await page.locator("#int-email-provider").inputValue();
    await page.locator("#int-resend-key").fill("re_e2e_dummy_key_Q7Z9");
    await page.locator("#int-save").click();
    await page.getByText("Saved.", { exact: true }).waitFor({ timeout: 30_000 });
    await page.reload();
    await page.locator("#int-resend-key-status").getByText("••••Q7Z9").waitFor();
    assert.equal(await page.locator("#int-resend-key").inputValue(), "", "the key is never sent back to the browser");
    assert.ok(!(await page.content()).includes("re_e2e_dummy_key"), "full key not in the page");
    // Remove it again so the server falls back to its environment.
    await page.locator("#int-resend-clear").check();
    await page.locator("#int-email-provider").selectOption(before);
    await page.locator("#int-save").click();
    await page.getByText("Saved.", { exact: true }).waitFor({ timeout: 30_000 });
    await page.reload();
    assert.equal(await page.locator("#int-resend-key-status").getByText("••••Q7Z9").count(), 0);
  });

  await step("integrations validation shows field errors", async () => {
    await page.goto(`${BASE}/console/integrations`);
    await page.locator("#int-root-domain").fill("not a domain");
    await page.locator("#int-save").click();
    await page.getByText("Enter a domain, e.g. example.com.").waitFor({ timeout: 30_000 });
  });

  await step("platform settings: sign-up mode lives here and saves", async () => {
    await page.goto(`${BASE}/console/settings`);
    await page.getByRole("heading", { name: "Platform settings", level: 1 }).waitFor();
    const group = page.getByRole("radiogroup", { name: "Sign-up mode" });
    const current = await group.locator("input:checked").inputValue();
    const other = current === "open" ? "approval" : "open";
    await group.locator(`input[value="${other}"]`).check({ force: true });
    await page.locator("#signup-mode-save").click();
    await page.getByText("Sign-up mode saved.").waitFor({ timeout: 30_000 });
    await page.reload();
    assert.equal(await page.getByRole("radiogroup", { name: "Sign-up mode" }).locator("input:checked").inputValue(), other);
    // Restore.
    await page.getByRole("radiogroup", { name: "Sign-up mode" }).locator(`input[value="${current}"]`).check({ force: true });
    await page.locator("#signup-mode-save").click();
    await page.getByText("Sign-up mode saved.").waitFor({ timeout: 30_000 });
  });

  await step("the old sign-ups page points to Platform settings", async () => {
    await page.goto(`${BASE}/console/signups`);
    await page.getByText("Who can create a company", { exact: true }).waitFor();
    await page.getByRole("link", { name: "Platform settings" }).first().waitFor();
  });

  await step("platform settings save (identity, defaults, reserved subdomains)", async () => {
    await page.goto(`${BASE}/console/settings`);
    const name = await page.locator("#ps-name").inputValue();
    const reserved = await page.locator("#ps-reserved").inputValue();
    await page.locator("#ps-support-email").fill("support@e2e.test");
    await page.locator("#ps-reserved").fill([reserved, "e2e-reserved"].filter(Boolean).join(", "));
    await page.locator("#ps-save").click();
    await page.getByText("Saved.", { exact: true }).waitFor({ timeout: 30_000 });
    await page.reload();
    assert.equal(await page.locator("#ps-name").inputValue(), name);
    assert.equal(await page.locator("#ps-support-email").inputValue(), "support@e2e.test");
    assert.ok((await page.locator("#ps-reserved").inputValue()).includes("e2e-reserved"));
  });

  await step("settings validation shows field errors", async () => {
    await page.locator("#ps-support-url").fill("not-a-url");
    await page.locator("#ps-save").click();
    await page.getByText("Enter a full URL, e.g. https://help.example.com").waitFor({ timeout: 30_000 });
  });

  await step("no uncaught page errors", async () => {
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
