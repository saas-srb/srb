/**
 * Browser test for Phases 3–5: automations (template → triggered by a new
 * lead → notification in the Staff Hub bell), Cmd/Ctrl+K search, the activity
 * log, the company strip on the Staff Hub and CSV import — against a RUNNING
 * server (production build recommended).
 *
 *   TEST_COMPANY_URL=http://acme.localhost:3006 TEST_COMPANY_EMAIL=... TEST_COMPANY_PASSWORD=... \
 *   node scripts/e2e/phase-3-5.e2e.mjs
 *
 * The login must be a Super Admin of a company whose plan includes CRM
 * ("lms") and that is not read-only. The test creates three leads (one
 * through the public lead form API, two by import) and one automation, which
 * it deletes at the end.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const COMPANY_URL = process.env.TEST_COMPANY_URL;
const EMAIL = process.env.TEST_COMPANY_EMAIL;
const PASSWORD = process.env.TEST_COMPANY_PASSWORD;
if (!COMPANY_URL || !EMAIL || !PASSWORD) {
  console.error("Set TEST_COMPANY_URL, TEST_COMPANY_EMAIL and TEST_COMPANY_PASSWORD.");
  process.exit(2);
}

const RUN = String(Date.now());
const digits = RUN.slice(-8);
const LEAD_NAME = `Zephyr Quill ${RUN}`;
const LEAD_EMAIL = `zephyr.${RUN}@e2e-example.com`;
const TEMPLATE_NAME = "New lead → notify sales";

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
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${url} scrolls horizontally by ${overflow}px`);
}

/** The automation row this run created (the newest one with the template's name). */
const automationRow = (page) => page.locator("[data-automation]").filter({ hasText: TEMPLATE_NAME }).first();

const browser = await chromium.launch({ channel: "chrome", headless: true });
const pageErrors = [];

try {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await step("company Super Admin signs in", async () => {
    await signIn(page, COMPANY_URL, EMAIL, PASSWORD);
  });

  await step("settings hub links to Automations, Import data and the Audit log", async () => {
    await page.goto(`${COMPANY_URL}/commandos/settings`);
    for (const href of ["/commandos/settings/automations", "/commandos/settings/import", "/commandos/settings/audit-log"]) await page.locator(`a[href="${href}"]`).waitFor();
  });

  // ── Phase 3: automations ───────────────────────────────────────────────
  await step("add the “New lead → notify sales” template with one click", async () => {
    await page.goto(`${COMPANY_URL}/commandos/settings/automations`);
    await page.getByRole("heading", { name: "Automations" }).waitFor();
    assert.equal(await page.locator('[id^="automation-template-"]').count(), 4, "four templates");
    await page.click("#automation-template-lead-notify-sales");
    await page.locator("#automation-notice").getByText("Added").waitFor();
    const row = automationRow(page);
    await row.waitFor();
    assert.equal(await row.getAttribute("data-enabled"), "true");
    await row.getByText("Hasn't run yet").waitFor();
  });

  await step("edit it: notify Super Admins (so this login receives it), with a condition", async () => {
    const row = automationRow(page);
    await row.locator("[data-edit-automation]").click();
    await page.locator("#automation-form").waitFor();
    assert.equal(await page.inputValue("#automation-trigger"), "lead.created");
    await page.getByLabel("Action 1 role").selectOption("super_admin");
    await page.click("#automation-add-condition");
    await page.getByLabel("Condition 1 field").selectOption("name");
    await page.getByLabel("Condition 1 comparison").selectOption("contains");
    await page.getByLabel("Condition 1 value").fill("Zephyr Quill");
    await page.click("#automation-save");
    await page.locator("#automation-notice").getByText("Automation saved.").waitFor();
    await automationRow(page).getByText("1 condition").waitFor();
  });

  await step("the form refuses an http:// webhook with a clear message", async () => {
    await page.click("#automation-new");
    await page.fill("#automation-name", "Bad webhook");
    await page.getByLabel("Action 1 type").selectOption("webhook");
    await page.getByLabel("Action 1 webhook URL").fill("http://example.com/hook");
    await page.click("#automation-save");
    await page.locator("#automation-form [role=alert]").getByText("https://").waitFor();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.locator("#automation-form").waitFor({ state: "detached" });
  });

  await step("Send test runs it and the run history shows the test run", async () => {
    const row = automationRow(page);
    await row.locator("[data-test-automation]").click();
    await page.locator("#automation-notice").getByText("Test sent").waitFor({ timeout: 30_000 });
    await automationRow(page).locator('[data-last-run="success"]').waitFor();
    await automationRow(page).locator("[data-history-automation]").click();
    const history = automationRow(page).locator("[data-run-history]");
    await history.waitFor();
    await history.getByText("Succeeded (test)").first().waitFor();
  });

  await step("the enabled toggle switches it off and on", async () => {
    const toggle = automationRow(page).getByRole("checkbox");
    await toggle.click();
    await page.locator('[data-automation][data-enabled="false"]').filter({ hasText: TEMPLATE_NAME }).first().waitFor();
    await automationRow(page).getByRole("checkbox").click();
    await page.locator('[data-automation][data-enabled="true"]').filter({ hasText: TEMPLATE_NAME }).first().waitFor();
  });

  let unreadBefore = 0;
  await step("creating a lead (public lead form API) triggers the automation", async () => {
    await page.goto(`${COMPANY_URL}/commandos`);
    unreadBefore = Number(await page.locator("#hub-bell").getAttribute("data-unread"));
    // In the browser: Node can't resolve *.localhost company hosts.
    const res = await page.evaluate(
      async ({ name, email, phone }) => {
        const fd = new FormData();
        fd.set("name", name);
        fd.set("email", email);
        fd.set("phone", phone);
        fd.set("subService", "web-app-development");
        fd.set("message", "Created by the phase 3-5 browser test");
        const r = await fetch("/api/leads/software-development", { method: "POST", body: fd });
        return { status: r.status, body: await r.text() };
      },
      { name: LEAD_NAME, email: LEAD_EMAIL, phone: `+91 9${digits}0` },
    );
    assert.equal(res.status, 201, res.body.slice(0, 200));
  });

  // ── Phase 4: notifications, search, activity ───────────────────────────
  await step("the notification appears in the Staff Hub bell", async () => {
    // The workflow runs after the response; allow it a few seconds.
    await assert.doesNotReject(async () => {
      for (let i = 0; i < 20; i++) {
        await page.goto(`${COMPANY_URL}/commandos`);
        const unread = Number(await page.locator("#hub-bell").getAttribute("data-unread"));
        if (unread > unreadBefore) return;
        await page.waitForTimeout(1000);
      }
      throw new Error("the bell's unread count never went up");
    });
    await page.locator("#hub-bell-count").waitFor();
  });

  await step("notifications page lists it; mark all as read clears the bell", async () => {
    await page.click("#hub-bell");
    await page.waitForURL((u) => u.pathname === "/commandos/notifications");
    const item = page.locator('#notifications-list li[data-read="false"]').filter({ hasText: `New lead: ${LEAD_NAME}` });
    await item.first().waitFor();
    await item.first().getByText(LEAD_EMAIL).waitFor();
    await page.click("#notifications-mark-all");
    await page.locator("#notifications-unread").getByText("You're all caught up.").waitFor();
    await page.waitForFunction(() => document.querySelector("#hub-bell")?.getAttribute("data-unread") === "0");
    assert.equal(await page.locator('#notifications-list li[data-read="false"]').count(), 0);
    await page.reload();
    assert.equal(await page.locator("#hub-bell").getAttribute("data-unread"), "0", "still read after a reload");
  });

  await step("the automation's history shows the real run", async () => {
    await page.goto(`${COMPANY_URL}/commandos/settings/automations`);
    await automationRow(page).locator("[data-history-automation]").click();
    const history = automationRow(page).locator("[data-run-history]");
    await history.getByText(LEAD_NAME).first().waitFor();
    assert.ok((await history.locator('[data-run="success"]').count()) >= 2, "the test run and the real run");
  });

  await step("Cmd/Ctrl+K opens search and finds the lead; the search button opens it too", async () => {
    await page.goto(`${COMPANY_URL}/commandos`);
    await page.locator("#hub-search-button").waitFor();
    await page.keyboard.press("Control+k");
    await page.locator("#hub-search-input").waitFor();
    await page.keyboard.press("Escape");
    await page.locator("#hub-search-input").waitFor({ state: "detached" });
    await page.click("#hub-search-button");
    await page.fill("#hub-search-input", "zz-no-such-record-zz");
    await page.locator("#hub-search-empty").waitFor();
    await page.fill("#hub-search-input", LEAD_NAME);
    const hit = page.locator('#hub-search-results [data-hit-type="lead"]').filter({ hasText: LEAD_NAME });
    await hit.first().waitFor();
    await page.keyboard.press("Enter");
    await page.waitForURL((u) => u.pathname.startsWith("/dealflow-ai"), { timeout: 30_000 });
  });

  await step("audit log (workspace events) shows the event and filters by type", async () => {
    await page.goto(`${COMPANY_URL}/commandos/settings/audit-log?source=workspace`);
    await page.getByRole("heading", { name: "Workspace events" }).waitFor();
    const row = page.locator('#activity-list li[data-event-type="lead.created"]').filter({ hasText: LEAD_NAME });
    await row.first().waitFor();
    await page.selectOption("#activity-type", "lead.created");
    await page.waitForURL((u) => u.searchParams.get("type") === "lead.created");
    await page.locator('#activity-list li[data-event-type="lead.created"]').first().waitFor();
    assert.equal(await page.locator('#activity-list li:not([data-event-type="lead.created"])').count(), 0, "only lead.created rows");
    await page.selectOption("#activity-type", "invoice.paid");
    await page.waitForURL((u) => u.searchParams.get("type") === "invoice.paid");
    assert.equal(await page.locator("#activity-list li").filter({ hasText: LEAD_NAME }).count(), 0);
    await page.fill("#activity-from", "2099-01-01");
    await page.waitForURL((u) => u.searchParams.get("from") === "2099-01-01");
    await page.getByText("Nothing matches these filters yet.").waitFor();
  });

  await step("Staff Hub shows the company strip: KPIs, recent activity, and the Ask box answers", async () => {
    await page.goto(`${COMPANY_URL}/commandos`);
    await page.locator("#company-today").waitFor();
    await page.locator('#company-kpis [data-kpi="open_leads"]').waitFor();
    await page.locator("#company-activity").getByText(LEAD_NAME).first().waitFor();
    await page.getByText("My Workspace Status").waitFor(); // the rest of the hub is untouched
    await page.fill("#hub-ask-input", "How many open leads do we have?");
    await page.click("#hub-ask-submit");
    // Either a real answer, or the friendly "not set up" / "limit reached" message — never an error page.
    const answer = page.locator("#hub-ask-answer");
    await answer.waitFor({ timeout: 60_000 });
    assert.ok(((await answer.textContent()) ?? "").trim().length > 10);
  });

  // ── Phase 5: import ────────────────────────────────────────────────────
  await step("sample CSV downloads with the right header", async () => {
    await page.goto(`${COMPANY_URL}/commandos/settings/import`);
    await page.getByRole("heading", { name: "Import data" }).waitFor();
    for (const t of ["leads", "clients", "employees"]) await page.locator(`#import-type-${t}`).waitFor();
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#import-sample")]);
    assert.equal(download.suggestedFilename(), "leads-sample.csv");
    const { readFile } = await import("node:fs/promises");
    assert.match((await readFile(await download.path(), "utf8")).split("\r\n")[0], /^Name,Email,Phone,/);
  });

  await step("import a 3-row leads CSV with one bad row: preview, then import", async () => {
    const csv = ["Full Name,E-mail,Mobile,Notes", `Import One ${RUN},import.one.${RUN}@e2e-example.com,+91 8${digits}1,First`, `Import Bad ${RUN},not-an-email,+91 8${digits}2,Broken`, `Import Two ${RUN},import.two.${RUN}@e2e-example.com,+91 8${digits}3,"Has, a comma"`].join("\n");
    await page.setInputFiles("#import-file", { name: "leads.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await page.locator("#import-mapping").waitFor();
    // Columns were matched from differently spelled headers.
    assert.equal(await page.inputValue("#import-map-name"), "0");
    assert.equal(await page.inputValue("#import-map-email"), "1");
    assert.equal(await page.inputValue("#import-map-phone"), "2");
    assert.equal(await page.inputValue("#import-map-message"), "3");
    // The mapping is editable: unmapping a required column is caught, then put back.
    await page.selectOption("#import-map-phone", "-1");
    await page.click("#import-preview-button");
    await page.locator("#import-error").getByText("Phone").waitFor();
    await page.selectOption("#import-map-phone", "2");

    await page.click("#import-preview-button");
    await page.locator("#import-preview").waitFor();
    assert.equal(await page.textContent("#import-valid"), "2");
    await page.locator('#import-preview-errors [data-line="3"]').getByText("valid email").waitFor();
    await page.getByText("Nothing has been saved yet.").waitFor();

    await page.click("#import-run-button");
    await page.locator("#import-result").waitFor({ timeout: 120_000 });
    assert.equal(await page.textContent("#import-created"), "2");
    await page.locator('#import-result-errors [data-line="3"]').waitFor();
  });

  await step("the imported leads are searchable, and importing the same file again finds only duplicates", async () => {
    await page.getByRole("button", { name: "Import another file" }).click();
    const csv = ["Name,Email,Phone", `Import One ${RUN},import.one.${RUN}@e2e-example.com,+91 8${digits}1`].join("\n");
    await page.setInputFiles("#import-file", { name: "again.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    await page.click("#import-preview-button");
    await page.locator("#import-preview").waitFor();
    assert.equal(await page.textContent("#import-valid"), "0");
    await page.locator('#import-preview-duplicates [data-line="2"]').getByText("already exists").waitFor();
    assert.equal(await page.locator("#import-run-button").count(), 0, "nothing to import");

    await page.goto(`${COMPANY_URL}/commandos`);
    await page.click("#hub-search-button");
    await page.fill("#hub-search-input", `Import Two ${RUN}`);
    await page.locator('#hub-search-results [data-hit-type="lead"]').filter({ hasText: `Import Two ${RUN}` }).first().waitFor();
    await page.keyboard.press("Escape");
  });

  await step("employees import offers invitations as an unticked opt-in", async () => {
    await page.goto(`${COMPANY_URL}/commandos/settings/import`);
    await page.click("#import-type-employees");
    const csv = ["First name,Last name,Work email", `Test,Person,test.person.${RUN}@e2e-example.com`].join("\n");
    await page.setInputFiles("#import-file", { name: "employees.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    const box = page.locator("#import-send-invites");
    await box.waitFor();
    assert.equal(await box.isChecked(), false, "invitations are off by default");
    await page.click("#import-preview-button");
    await page.locator("#import-preview").getByText("No invitation emails will be sent").waitFor();
    // Preview only — this test doesn't create employees.
  });

  await step("unsigned requests can't import or download samples", async () => {
    const anon = await browser.newContext();
    const ap = await anon.newPage();
    await ap.goto(`${COMPANY_URL}/commandos/login`);
    const res = await ap.evaluate(async () => {
      const run = await fetch("/commandos/settings/import/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "leads", csv: "Name,Email,Phone\nA,a@b.co,+91 90000 00000", mapping: { name: 0, email: 1, phone: 2 }, dryRun: false }) });
      const sample = await fetch("/commandos/settings/import/sample?type=leads");
      return { run: run.status, sample: sample.status };
    });
    assert.equal(res.run, 401);
    assert.equal(res.sample, 403);
    for (const path of ["/commandos/settings/automations", "/commandos/settings/audit-log?source=workspace", "/commandos/settings/import", "/commandos/notifications"]) {
      await ap.goto(`${COMPANY_URL}${path}`);
      assert.ok(new URL(ap.url()).pathname.endsWith("/login"), `${path} → ${ap.url()}`);
    }
    await anon.close();
  });

  await step("no horizontal scroll at phone width", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/commandos", "/commandos/notifications", "/commandos/settings", "/commandos/settings/automations", "/commandos/settings/audit-log", "/commandos/settings/audit-log?source=workspace", "/commandos/settings/import"]) await noHorizontalScroll(page, `${COMPANY_URL}${path}`);
    // The editor and the search palette fit too.
    await page.goto(`${COMPANY_URL}/commandos/settings/automations`);
    await page.click("#automation-new");
    await page.click("#automation-add-condition");
    await page.locator("#automation-form").waitFor();
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `automation editor scrolls horizontally by ${overflow}px`);
    await page.goto(`${COMPANY_URL}/commandos`);
    await page.click("#hub-search-button");
    await page.fill("#hub-search-input", LEAD_NAME);
    await page.locator("#hub-search-results").waitFor();
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `search palette scrolls horizontally by ${overflow}px`);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  await step("clean up: delete the automation", async () => {
    await page.goto(`${COMPANY_URL}/commandos/settings/automations`);
    const before = await page.locator("[data-automation]").filter({ hasText: TEMPLATE_NAME }).count();
    const row = automationRow(page);
    await row.getByRole("button", { name: `Delete ${TEMPLATE_NAME}` }).click();
    await row.getByRole("button", { name: "Confirm delete" }).click();
    await page.locator("#automation-notice").getByText("Automation deleted.").waitFor();
    assert.equal(await page.locator("[data-automation]").filter({ hasText: TEMPLATE_NAME }).count(), before - 1);
  });

  await ctx.close();

  await step("no page errors", async () => {
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
