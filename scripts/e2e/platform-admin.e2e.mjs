/**
 * Browser test for Platform users & roles and the Audit log, against a
 * RUNNING server (production build recommended).
 *
 *   PANEL_BASE_URL=http://localhost:3006 OWNER_EMAIL=... OWNER_PASSWORD=... \
 *   [MEMBER_EMAIL=... MEMBER_PASSWORD=...] node scripts/e2e/platform-admin.e2e.mjs
 *
 * OWNER_* is a Platform Owner (or legacy super_admin) of the platform owner
 * company. MEMBER_* (optional) is another owner-company account WITHOUT
 * platform access and not a super_admin; the test grants it Support, checks
 * what it can and can't open, then revokes it again.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.PANEL_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.OWNER_EMAIL;
const PASSWORD = process.env.OWNER_PASSWORD;
const MEMBER_EMAIL = process.env.MEMBER_EMAIL;
const MEMBER_PASSWORD = process.env.MEMBER_PASSWORD;
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

async function signIn(page, email, password) {
  await page.goto(`${BASE}/commandos/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 }), page.press('input[name="password"]', "Enter")]);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
const roleName = `E2E Role ${Date.now().toString(36)}`;

try {
  await step("owner signs in and opens Platform users & roles", async () => {
    await signIn(page, EMAIL, PASSWORD);
    await page.goto(`${BASE}/console/users`);
    await page.getByRole("heading", { name: "Platform users & roles", level: 1 }).waitFor();
    await page.locator(`li[data-platform-user="${EMAIL.toLowerCase()}"]`).waitFor();
  });

  await step("roles tab lists the four built-in roles", async () => {
    await page.click("#tab-roles");
    for (const name of ["Platform Owner", "Billing Manager", "Support", "Viewer"]) await page.locator(`li[data-platform-role="${name}"]`).waitFor();
    assert.equal(await page.getByRole("button", { name: "Delete Viewer" }).count(), 0, "built-ins can't be deleted");
    assert.ok(new URL(page.url()).searchParams.get("tab") === "roles", "tab kept in the URL");
  });

  await step("create a custom role with a permission checklist", async () => {
    await page.click("#new-role");
    await page.fill("#role-name", roleName);
    await page.fill("#role-desc", "Created by the browser test");
    await page.check('[id="perm-audit.read"]');
    await page.check('[id="perm-plans.read"]');
    await page.click("#role-save");
    await page.locator(`li[data-platform-role="${roleName}"]`).waitFor({ timeout: 30_000 });
    await page.locator(`li[data-platform-role="${roleName}"]`).getByText("2 permissions").waitFor();
  });

  await step("edit the custom role", async () => {
    await page.getByRole("button", { name: `Edit ${roleName}` }).click();
    await page.check('[id="perm-usage.read"]');
    await page.click("#role-save");
    await page.locator(`li[data-platform-role="${roleName}"]`).getByText("3 permissions").waitFor({ timeout: 30_000 });
  });

  await step("duplicate role names are rejected", async () => {
    await page.click("#new-role");
    await page.fill("#role-name", "viewer");
    await page.check('[id="perm-audit.read"]');
    await page.click("#role-save");
    await page.getByText('A role called "viewer" already exists.').waitFor({ timeout: 30_000 });
    await page.keyboard.press("Escape");
  });

  await step("delete the custom role", async () => {
    await page.getByRole("button", { name: `Delete ${roleName}` }).click();
    await page.getByRole("button", { name: "Delete role" }).click();
    await page.locator(`li[data-platform-role="${roleName}"]`).waitFor({ state: "detached", timeout: 30_000 });
  });

  if (MEMBER_EMAIL && MEMBER_PASSWORD) {
    const member = MEMBER_EMAIL.toLowerCase();
    await step("give an existing team member the Support role", async () => {
      await page.goto(`${BASE}/console/users`);
      await page.click("#add-platform-user");
      const option = page.locator("#pu-existing option", { hasText: member });
      await page.selectOption("#pu-existing", await option.getAttribute("value"));
      await page.selectOption("#pu-role", "support");
      await page.click("#pu-submit");
      await page.locator(`li[data-platform-user="${member}"]`).waitFor({ timeout: 30_000 });
      assert.equal(await page.getByLabel(`Role for ${member}`).inputValue(), "support");
    });

    await step("Support can open companies, not users or tax settings", async () => {
      const ctx2 = await browser.newContext();
      const p2 = await ctx2.newPage();
      try {
        await signIn(p2, MEMBER_EMAIL, MEMBER_PASSWORD);
        await p2.goto(`${BASE}/console/companies`);
        await p2.getByRole("heading", { name: "Companies", level: 1 }).waitFor();
        await p2.goto(`${BASE}/console/users`);
        assert.equal(new URL(p2.url()).pathname, "/console");
        await p2.getByRole("alert").getByText("doesn't include access").waitFor();
        await p2.goto(`${BASE}/console/settings/billing`);
        assert.equal(new URL(p2.url()).pathname, "/console");
      } finally {
        await ctx2.close();
      }
    });

    await step("revoke the member; they lose the product", async () => {
      await page.goto(`${BASE}/console/users`);
      await page.getByRole("button", { name: `Revoke ${member}` }).click();
      await page.getByRole("button", { name: "Revoke access" }).click();
      await page.locator(`li[data-platform-user="${member}"]`).waitFor({ state: "detached", timeout: 30_000 });
      const ctx3 = await browser.newContext();
      const p3 = await ctx3.newPage();
      try {
        await signIn(p3, MEMBER_EMAIL, MEMBER_PASSWORD);
        await p3.goto(`${BASE}/console`);
        assert.ok(!new URL(p3.url()).pathname.startsWith("/console"), `still in the product: ${p3.url()}`);
      } finally {
        await ctx3.close();
      }
    });
  } else {
    console.log("  - MEMBER_EMAIL/MEMBER_PASSWORD not set: skipping grant/revoke steps");
  }

  await step("audit log shows the role changes", async () => {
    await page.goto(`${BASE}/console/audit`);
    await page.getByRole("heading", { name: "Audit log", level: 1 }).waitFor();
    await page.selectOption("#audit-action", "platform_role");
    await page.waitForURL((u) => u.searchParams.get("action") === "platform_role", { timeout: 30_000 });
    for (const a of ["platform_role.create", "platform_role.update", "platform_role.delete"]) await page.locator("table").getByText(a, { exact: true }).first().waitFor();
  });

  await step("detail drawer shows the details JSON", async () => {
    await page.getByRole("button", { name: "Details of platform_role.create" }).first().click();
    await page.locator("#audit-details-json").waitFor();
    assert.ok((await page.locator("#audit-details-json").textContent()).includes(roleName));
    await page.keyboard.press("Escape");
  });

  await step("text search narrows the log", async () => {
    await page.fill("#audit-q", roleName);
    await page.waitForURL((u) => u.searchParams.get("q") === roleName, { timeout: 30_000 });
    await page.locator("table").getByText("platform_role.create", { exact: true }).first().waitFor();
  });

  await step("CSV export downloads", async () => {
    await page.goto(`${BASE}/console/audit?action=platform_role`);
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), page.click("#audit-export")]);
    assert.match(download.suggestedFilename(), /^platform-audit-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  await step("no horizontal scroll at phone width, no page errors", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/console/users", "/console/users?tab=roles", "/console/audit"]) {
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
