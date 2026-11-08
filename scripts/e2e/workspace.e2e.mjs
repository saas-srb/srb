/**
 * Browser test for the Workspace as the company's single place: one sign-in, a
 * permission-driven sidebar, the company pages and the former admin pages
 * inside the Workspace, products without a second login, old /admin links
 * redirected, sign-out everywhere, and no Platform Console for a tenant company. Also: the one Dashboard (no Command
 * Center item), the one Audit log under Company, Documents under Account, every Company page under /commandos/settings/*,
 * and the old /settings, /onboarding, /upgrade, /commandos/command-center, /commandos/activity-log and
 * /commandos/documents URLs redirecting. Against a RUNNING server (production build recommended).
 *
 *   TEST_COMPANY_URL=http://acme.localhost:3006 TEST_COMPANY_EMAIL=... TEST_COMPANY_PASSWORD=... \
 *   [PANEL_BASE_URL=http://localhost:3006 OWNER_EMAIL=... OWNER_PASSWORD=...] \
 *   node scripts/e2e/workspace.e2e.mjs
 *
 * TEST_COMPANY_* must be a Super Admin login of a tenant company (not the
 * platform owner). The optional OWNER_* login is a platform owner; with it
 * the single "Platform Console" link is checked too. The only write is saving
 * the organization profile with the values it already has.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const COMPANY_URL = process.env.TEST_COMPANY_URL;
const COMPANY_EMAIL = process.env.TEST_COMPANY_EMAIL;
const COMPANY_PASSWORD = process.env.TEST_COMPANY_PASSWORD;
const BASE = process.env.PANEL_BASE_URL;
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
if (!COMPANY_URL || !COMPANY_EMAIL || !COMPANY_PASSWORD) {
  console.error("Set TEST_COMPANY_URL, TEST_COMPANY_EMAIL and TEST_COMPANY_PASSWORD.");
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
}

async function noHorizontalScroll(page, url) {
  await page.goto(url);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${url} scrolls horizontally by ${overflow}px`);
}

/** Company-host HTTP calls go through the page (Node can't resolve *.localhost). */
const fetchStatus = (page, path) => page.evaluate(async (p) => (await fetch(p, { redirect: "manual" })).status, path);

/** The desktop sidebar (the mobile one lives in a dialog that is only mounted while open). */
const sidebar = (page) => page.locator('aside nav[aria-label="Workspace"]');
const section = (page, key) => sidebar(page).locator(`[data-nav-section="${key}"]`);
/** An open (not locked) product tile on the Staff Hub dashboard: the way into a product now that the sidebar no longer lists them. */
const panelTile = (page, panel) => page.locator(`[data-module="${panel}"]:not([data-locked])`);
const ALL_PANELS = ["hrms", "pms", "lms", "fms", "prms", "tms", "messenger", "sop", "dlms", "ots", "aibots", "smms", "seo", "cms"];
/** The analytics added for the products that had none: page heading and one KPI card of each. */
const NEW_ANALYTICS = {
  sop: ["SOP – SOP Analytics", "Total SOPs"],
  dlms: ["DLMS – Digi Locker Analytics", "Vault Records"],
  ots: ["OTS – Online Tests Analytics", "Total Tests"],
  aibots: ["AI Bots – AI Bots Analytics", "Total Bots"],
  smms: ["SMMS – Social Media Analytics", "Campaigns"],
  seo: ["SEO – SEO Analytics", "Site Audit Score"],
  cms: ["CMS – Website Analytics", "Total Pages"],
};
const pathOf = (page) => new URL(page.url()).pathname;

/** The Company pages: path → something only that page renders. */
const COMPANY_PAGES = [
  ["/commandos/settings", (p) => p.locator("[data-settings-card]").first()],
  ["/commandos/onboarding", (p) => p.locator("#workspace-content button").first()],
  ["/commandos/settings/profile", (p) => p.getByRole("heading", { name: "Organization profile", level: 1 })],
  ["/commandos/settings/billing", (p) => p.locator("#workspace-content").getByText("Plan & billing").first()],
  ["/commandos/settings/billing/invoices", (p) => p.locator("#saas-payments")],
  ["/commandos/settings/usage", (p) => p.locator("#usage-seats")],
  ["/commandos/settings/domains", (p) => p.locator("li[data-domain]").first()],
  ["/commandos/settings/branding", (p) => p.locator("#workspace-content").getByText("Branding").first()],
  ["/commandos/settings/payments", (p) => p.locator("#payment-account-status")],
  ["/commandos/settings/integrations", (p) => p.locator("#integrations-list")],
  ["/commandos/settings/automations", (p) => p.getByRole("heading", { name: "Automations" })],
  ["/commandos/settings/import", (p) => p.getByRole("heading", { name: "Import data" })],
  ["/commandos/settings/audit-log", (p) => p.getByRole("heading", { name: "Audit log", level: 1 })],
  ["/commandos/settings/security", (p) => p.locator("#security-accounts")],
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const pageErrors = [];

try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${pathOf(page)}: ${e.message}`));

  await step("sign-in of an owner whose setup is not complete lands on onboarding; the Dashboard link stays on the dashboard, with the setup strip", async () => {
    await signIn(page, COMPANY_URL, COMPANY_EMAIL, COMPANY_PASSWORD);
    if (pathOf(page) !== "/commandos/onboarding") return console.log("      (setup already complete for this company: landing/strip checks skipped)");
    // The landing must STAY on the wizard: right after sign-in the login page refreshes in the background
    // and used to bounce the owner on to /workspace, so settle before asserting.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    assert.equal(pathOf(page), "/commandos/onboarding", "sign-in lands on the onboarding wizard and stays there");
    assert.equal(await page.locator("#setup-banner").count(), 0, "no strip on the wizard itself");
    await sidebar(page).getByRole("link", { name: "Dashboard", exact: true }).click();
    await page.waitForURL((u) => u.pathname === "/commandos", { timeout: 30_000 });
    await page.getByText("My Operational Products").waitFor();
    assert.equal(pathOf(page), "/commandos", "/commandos is never redirected to onboarding");
    await page.locator("#setup-banner").getByRole("link", { name: "Complete setup" }).waitFor();
    await page.goto(`${COMPANY_URL}/commandos/settings/billing`);
    await page.locator("#setup-banner").waitFor();
  });

  await step("company Super Admin is signed in and the dashboard opens", async () => {
    await page.goto(`${COMPANY_URL}/commandos`);
    await page.getByText("My Operational Products").waitFor();
    await sidebar(page).waitFor();
  });

  await step("sidebar: Dashboard, Analytics, Management, Company, Account — no Products and no Platform section", async () => {
    await sidebar(page).getByRole("link", { name: "Dashboard", exact: true }).waitFor();
    assert.equal(await sidebar(page).getByRole("link", { name: "Dashboard", exact: true }).count(), 1, "one Dashboard");
    assert.equal(await sidebar(page).getByText("Command Center").count(), 0, "no Command Center item: the dashboard is the Command Center");
    assert.equal(await sidebar(page).locator('a[href="/commandos/command-center"]').count(), 0);
    for (const key of ["analytics", "manage", "company", "account"]) await section(page, key).first().waitFor({ state: "attached" });
    assert.equal(await section(page, "platform").count(), 0, "tenant has no Platform section");
    assert.equal(await page.locator('a[href^="/console"]').count(), 0, "no Platform link anywhere on the Workspace");
    assert.equal(await section(page, "panels").count(), 0, "the sidebar has no Products section");
    assert.equal(await sidebar(page).getByText("Products", { exact: true }).count(), 0, "no Products heading");
    for (const panel of ALL_PANELS) assert.equal(await sidebar(page).locator(`a[href="/${panel}"]`).count(), 0, `the sidebar links to /${panel}`);
    assert.ok((await page.locator("[data-module]:not([data-locked])").count()) >= 1, "the products are on the Staff Hub tiles");
    await section(page, "account").getByRole("link", { name: "Change Password" }).waitFor();
  });

  await step("Company and Management open on demand and list their pages", async () => {
    assert.equal(await section(page, "company").locator('a[href="/commandos/settings/billing"]').count(), 0, "Company starts closed");
    await sidebar(page).getByRole("button", { name: "Show Company menu" }).click();
    for (const [path] of COMPANY_PAGES.slice(1)) await section(page, "company").locator(`a[href="${path}"]`).waitFor();
    await section(page, "company").locator('a[href="/commandos/users"]').waitFor();
    await sidebar(page).getByRole("button", { name: "Show Management menu" }).click();
    await section(page, "manage").locator('a[href="/commandos/crm/leads"]').waitFor();
    for (const gone of ["/commandos/command-center", "/commandos/activity-log", "/commandos/documents", "/commandos/settings/audit-log", "/commandos/account/documents"]) assert.equal(await section(page, "manage").locator(`a[href="${gone}"]`).count(), 0, `Management no longer lists ${gone}`);
    assert.equal(await section(page, "manage").getByText(/audit|activity log|documents|command center/i).count(), 0, "no audit/activity/documents/command-center item in Management");
    assert.equal(await sidebar(page).locator('a[href^="/admin"]').count(), 0, "nothing points at the old admin product");
    await sidebar(page).getByRole("button", { name: "Hide Management menu" }).click();
    assert.equal(await section(page, "manage").locator('a[href="/commandos/crm/leads"]').count(), 0, "closes again");
    // Audit log lives under Company, Documents under Account.
    await section(page, "company").locator('a[href="/commandos/settings/audit-log"]').waitFor();
    await section(page, "account").locator('a[href="/commandos/account/documents"]').waitFor();
  });

  await step("every Management page listed in the sidebar opens, and its export API answers", async () => {
    await page.goto(`${COMPANY_URL}/commandos/crm/leads`);
    const hrefs = await section(page, "manage").getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    for (const must of ["/commandos/crm/leads"]) assert.ok(hrefs.includes(must), must);
    for (const href of hrefs) {
      const res = await page.goto(`${COMPANY_URL}${href}`);
      assert.equal(res?.status(), 200, href);
      assert.equal(pathOf(page), href, `${href} → ${pathOf(page)}`);
      await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 30_000 });
      assert.equal(await fetchStatus(page, `${href.replace("/commandos/", "/api/commandos/")}/export`), 200, `export of ${href}`);
    }
    console.log(`      (${hrefs.length} management pages)`);
  });

  await step("users page: seats badge; export uses the Workspace API", async () => {
    await page.goto(`${COMPANY_URL}/commandos/users`);
    await page.getByRole("heading", { name: /User/, level: 1 }).waitFor();
    await page.locator("#users-seats").getByText("seats").waitFor();
    assert.equal(await fetchStatus(page, "/api/commandos/users/export"), 200);
    assert.equal(await fetchStatus(page, "/api/admin/users/export"), 404, "the old API is gone");
  });

  await step("Documents (Account): opens at /commandos/account/documents and its export API answers", async () => {
    const res = await page.goto(`${COMPANY_URL}/commandos/account/documents`);
    assert.equal(res?.status(), 200);
    assert.equal(pathOf(page), "/commandos/account/documents");
    await page.getByRole("heading", { name: "Documents", level: 1 }).waitFor();
    await section(page, "account").locator('a[href="/commandos/account/documents"]').waitFor();
    assert.equal(await fetchStatus(page, "/api/commandos/documents/export"), 200);
  });

  await step("Audit log (Company): one page with a source switch — All, Workspace events, Product activity — and each source's own filters", async () => {
    await page.goto(`${COMPANY_URL}/commandos/settings/audit-log`);
    await page.getByRole("heading", { name: "Audit log", level: 1 }).waitFor();
    const tabs = await page.locator("#audit-sources a").evaluateAll((els) => els.map((e) => e.getAttribute("data-audit-source")));
    assert.deepEqual(tabs, ["all", "workspace", "panels"]);
    await page.locator('#audit-sources a[data-audit-source="workspace"]').click();
    await page.waitForURL((u) => u.searchParams.get("source") === "workspace", { timeout: 30_000 });
    await page.locator("#activity-count").waitFor();
    await page.locator("#activity-type").waitFor(); // event type filter
    await page.locator('#audit-sources a[data-audit-source="products"]').click();
    await page.waitForURL((u) => u.searchParams.get("source") === "panels", { timeout: 30_000 });
    await page.getByRole("link", { name: "Export" }).waitFor(); // product activity keeps its CSV export
    await page.locator('#audit-sources a[data-audit-source="all"]').click();
    await page.waitForURL((u) => u.searchParams.get("source") === "all", { timeout: 30_000 });
    await page.getByText("workspace events and product activity", { exact: false }).first().waitFor();
    assert.equal(await fetchStatus(page, "/api/commandos/activity-log/export"), 200);
  });

  await step("one notifications page and one bell", async () => {
    await page.goto(`${COMPANY_URL}/commandos/notifications`);
    await page.locator("#notifications-unread").waitFor();
    assert.equal(await page.locator("#hub-bell").count(), 1);
    assert.match((await page.locator("#hub-bell").getAttribute("data-unread")) ?? "", /^\d+$/);
  });

  await step("every sidebar link of the Workspace itself opens (no redirect to sign-in or back to the hub)", async () => {
    const hrefs = await section(page, "analytics").getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    assert.ok(hrefs.length >= 1, "analytics links");
    for (const href of [...hrefs, "/commandos/notifications"]) {
      const res = await page.goto(`${COMPANY_URL}${href}`);
      assert.equal(res?.status(), 200, href);
      assert.equal(pathOf(page), href);
      assert.equal(await page.getByText("Workspace Access Control Notice").count(), 0, `${href} is listed but denied`);
    }
  });

  await step("Analytics lists every product of the company's plan, the new ones included; two of the new pages show their heading and a KPI card", async () => {
    await page.goto(`${COMPANY_URL}/commandos`);
    await page.getByText("My Operational Products").waitFor();
    const listed = await section(page, "analytics").getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    // A Super Admin's open tiles are exactly the products in the plan that are switched on.
    const inPlan = [];
    for (const panel of ALL_PANELS) if ((await panelTile(page, panel).count()) > 0) inPlan.push(panel);
    assert.ok(inPlan.length >= 2, `open product tiles: ${inPlan.join(", ")}`);
    for (const panel of ALL_PANELS) assert.equal(listed.includes(`/commandos/analytics/${panel}`), inPlan.includes(panel), `analytics.${panel} listed=${listed.includes(`/commandos/analytics/${panel}`)} but product in plan=${inPlan.includes(panel)}`);
    assert.deepEqual(listed, [...listed].sort(), "Analytics keeps its alphabetical order");
    const fresh = Object.keys(NEW_ANALYTICS).filter((p) => inPlan.includes(p));
    assert.ok(fresh.length >= 2, `the plan has ${fresh.length} of the new analytics (${fresh.join(", ")}); two are needed`);
    for (const panel of fresh.slice(0, 2)) {
      const [heading, kpi] = NEW_ANALYTICS[panel];
      await section(page, "analytics").locator(`a[href="/commandos/analytics/${panel}"]`).click();
      await page.waitForURL((u) => u.pathname === `/commandos/analytics/${panel}`, { timeout: 30_000 });
      await page.getByRole("heading", { level: 1, name: heading }).waitFor();
      await page.locator("#workspace-content").getByText(kpi, { exact: true }).first().waitFor();
      assert.equal(await page.getByText("Workspace Access Control Notice").count(), 0, `${panel} analytics is listed but denied`);
      assert.equal(await sidebar(page).locator(`a[href="/commandos/analytics/${panel}"]`).count(), 1, "still in the sidebar on its own page");
    }
    console.log(`      (products in plan: ${inPlan.join(", ")}; opened: ${fresh.slice(0, 2).join(", ")})`);
  });

  await step("analytics of a product that isn't listed is refused on the server", async () => {
    const listed = new Set(await section(page, "analytics").getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("href"))));
    const hidden = [...ALL_PANELS, "portal", "workspace"].map((p) => `/commandos/analytics/${p}`).filter((h) => !listed.has(h));
    for (const href of hidden) {
      await page.goto(`${COMPANY_URL}${href}`);
      await page.getByText("Workspace Access Control Notice").first().waitFor();
    }
    console.log(`      (${hidden.length} unlisted analytics page(s) checked)`);
  });

  for (const [path, marker] of COMPANY_PAGES) {
    await step(`Company page ${path} opens inside the Workspace frame`, async () => {
      const res = await page.goto(`${COMPANY_URL}${path}`);
      assert.equal(res?.status(), 200);
      assert.equal(pathOf(page), path, `landed on ${pathOf(page)}`);
      await marker(page).waitFor({ timeout: 30_000 });
      await sidebar(page).waitFor();
      await page.locator("#hub-bell").waitFor();
      await page.locator("#workspace-content").waitFor();
    });
  }

  await step("settings hub: one card per Company item, none for the Platform Console", async () => {
    await page.goto(`${COMPANY_URL}/commandos/settings`);
    const keys = await page.locator("[data-settings-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-settings-card")));
    for (const k of ["setup", "profile", "users", "billing", "invoices", "usage", "domains", "branding", "payments", "integrations", "automations", "import", "audit", "security"]) assert.ok(keys.includes(`company.${k}`), `card ${k}`);
    assert.ok(!keys.includes("platform.panel"), "no Platform Console card");
    assert.equal(keys.length, 14);
  });

  await step("usage shows seats, AI tokens and storage; integrations lists three; invoices page has the payments card", async () => {
    await page.goto(`${COMPANY_URL}/commandos/settings/usage`);
    for (const id of ["usage-seats", "usage-ai", "usage-storage"]) assert.match((await page.locator(`#${id}`).getAttribute("data-level")) ?? "", /^(ok|near|over)$/);
    await page.goto(`${COMPANY_URL}/commandos/settings/integrations`);
    assert.deepEqual(await page.locator("#integrations-list [data-integration]").evaluateAll((els) => els.map((e) => e.getAttribute("data-integration"))), ["razorpay", "webhooks", "domain"]);
    await page.goto(`${COMPANY_URL}/commandos/settings/billing/invoices`);
    await page.locator("#saas-payments").getByText("Payments & refunds").waitFor();
  });

  await step("organization profile saves with the existing save action", async () => {
    await page.goto(`${COMPANY_URL}/commandos/settings/profile`);
    const ready = await page.evaluate(() => Boolean(document.querySelector("#ob-industry")?.value && document.querySelector("#ob-size")?.value));
    if (!ready) return console.log("      (profile has no industry/size yet — save skipped)");
    await page.getByRole("button", { name: "Save profile" }).click();
    await page.locator("#profile-saved").waitFor({ timeout: 30_000 });
  });

  await step("security page: last sign-in, sessions, sign out everywhere", async () => {
    await page.goto(`${COMPANY_URL}/commandos/settings/security`);
    await page.locator("#security-last-signin").waitFor();
    assert.ok(Number(await page.locator("#security-sessions").getAttribute("data-count")) >= 1);
    await page.locator("#security-signout-all").waitFor();
    await page.locator('#workspace-content a[href="/commandos/change-password"]').waitFor();
  });

  await step("old workspace-specific URLs redirect permanently (308) to their new home, query string kept", async () => {
    const cases = [
      ["/settings", "/commandos/settings"],
      ["/settings/profile", "/commandos/settings/profile"],
      ["/settings/billing/invoices", "/commandos/settings/billing/invoices"],
      ["/settings/import", "/commandos/settings/import"],
      ["/settings/activity", "/commandos/settings/audit-log?source=workspace"],
      ["/onboarding", "/commandos/onboarding"],
      ["/upgrade?module=fms", "/commandos/upgrade?module=fms"],
      ["/commandos/command-center", "/commandos"],
      ["/commandos/activity-log?module=pms", "/commandos/settings/audit-log?source=products&module=pms"],
      ["/commandos/documents", "/commandos/account/documents"],
    ];
    for (const [from, to] of cases) {
      const res = await page.goto(`${COMPANY_URL}${from}`);
      const hop = res?.request().redirectedFrom();
      assert.ok(hop, `${from} did not redirect`);
      assert.equal((await hop.response())?.status(), 308, `${from} is a permanent redirect`);
      const landed = new URL(page.url());
      const want = new URL(to, COMPANY_URL);
      assert.equal(landed.pathname, want.pathname, `${from} → ${landed.pathname}`);
      for (const [k, v] of want.searchParams) assert.equal(landed.searchParams.get(k), v, `${from} keeps ?${k}`);
    }
    // Not captured: the API and a product's own settings page are not redirected to /commandos/settings.
    assert.notEqual(await fetchStatus(page, "/api/commandos/users/export"), 308);
  });

  await step("old admin links land in the Workspace", async () => {
    for (const [from, to] of [
      ["/admin", "/commandos"],
      ["/admin/users", "/commandos/users"],
      ["/admin/activity-log", "/commandos/settings/audit-log"],
      ["/admin/crm/leads", "/commandos/crm/leads"],
      ["/admin/analytics/commandos", "/commandos/analytics/commandos"],
      ["/admin/notifications", "/commandos/notifications"],
      ["/admin/login", "/commandos"], // → /commandos/login, which forwards a signed-in user
    ]) {
      await page.goto(`${COMPANY_URL}${from}`);
      // /admin/login → /commandos/login, which forwards a signed-in user by the sign-in landing rule:
      // the dashboard, or the onboarding wizard while this owner's setup is still open.
      const ok = from === "/admin/login" ? ["/commandos", "/commandos/onboarding"].includes(pathOf(page)) : pathOf(page) === to;
      assert.ok(ok, `${from} → ${pathOf(page)}`);
    }
  });

  await step("two products open with no second sign-in, even without their own session cookies", async () => {
    for (const name of ["hrms_session", "pms_session", "lms_session", "admin_session"]) await ctx.clearCookies({ name });
    const opened = [];
    await page.goto(`${COMPANY_URL}/commandos`);
    for (const panel of ["hrms", "pms", "lms"]) {
      if ((await panelTile(page, panel).count()) === 0) continue; // no open Staff Hub tile: not in this company's plan / roles
      await page.goto(`${COMPANY_URL}/${panel}`);
      assert.ok(pathOf(page).startsWith(`/${panel}`) && !pathOf(page).endsWith("/login"), `/${panel} → ${pathOf(page)}`);
      opened.push(panel);
      await page.goto(`${COMPANY_URL}/${panel}/login`);
      assert.ok(pathOf(page).startsWith(`/${panel}`) && !pathOf(page).endsWith("/login"), `/${panel}/login forwards a signed-in user`);
      await page.goto(`${COMPANY_URL}/commandos`);
    }
    assert.ok(opened.length >= 2, `only ${opened.join(", ")} available`);
  });

  await step("a tenant company has no Platform Console: no link, and /platform is a 404", async () => {
    for (const path of ["/commandos", "/commandos/settings", "/commandos/account/documents"]) {
      await page.goto(`${COMPANY_URL}${path}`);
      assert.equal(await page.locator('a[href^="/console"]').count(), 0, `Platform link on ${path}`);
    }
    assert.equal((await page.goto(`${COMPANY_URL}/console`))?.status(), 404);
  });

  await step("phone width: the mobile menu has the same sections and no page scrolls sideways", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/commandos", "/commandos/settings", "/commandos/settings/profile", "/commandos/settings/usage", "/commandos/settings/integrations", "/commandos/settings/security", "/commandos/settings/billing/invoices", "/commandos/settings/billing", "/commandos/settings/audit-log", "/commandos/account/documents", "/commandos/onboarding", "/commandos/upgrade?module=fms"]) await noHorizontalScroll(page, `${COMPANY_URL}${path}`);
    await page.goto(`${COMPANY_URL}/commandos/settings/usage`);
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const mobile = page.getByRole("dialog").locator('nav[aria-label="Workspace"]');
    await mobile.waitFor();
    for (const key of ["analytics", "manage", "company", "account"]) await mobile.locator(`[data-nav-section="${key}"]`).first().waitFor({ state: "attached" });
    assert.equal(await mobile.locator('[data-nav-section="panels"]').count(), 0, "the mobile menu has no Products section either");
    assert.equal(await mobile.locator('a[href="/talentos"], a[href="/sprintos"], a[href="/dealflow-ai"]').count(), 0, "no product links in the mobile menu");
    await mobile.locator('a[href="/commandos/settings/usage"]').waitFor(); // Company opens by itself on one of its pages
    await mobile.locator('a[href="/commandos/settings/security"]').click();
    await page.waitForURL((u) => u.pathname === "/commandos/settings/security", { timeout: 30_000 });
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  await step("signed out: every page, old admin link and product sends to the one sign-in", async () => {
    const anon = await browser.newContext();
    const ap = await anon.newPage();
    for (const path of ["/commandos/settings", "/commandos/settings/profile", "/commandos/settings/audit-log", "/commandos/account/documents", "/commandos/onboarding", "/commandos/upgrade", "/settings", "/settings/profile", "/onboarding", "/upgrade", "/commandos/users", "/commandos/command-center", "/commandos/crm/leads", "/admin", "/admin/users"]) {
      await ap.goto(`${COMPANY_URL}${path}`);
      assert.equal(pathOf(ap), "/commandos/login", `${path} → ${pathOf(ap)}`);
    }
    for (const panel of ["hrms", "pms", "fms", "lms", "prms", "tms", "ots", "sop", "dlms", "cms", "seo", "smms", "aibots", "intelligence", "messenger"]) {
      await ap.goto(`${COMPANY_URL}/${panel}/login`);
      assert.equal(pathOf(ap), "/commandos/login", `/${panel}/login → ${pathOf(ap)}`);
      assert.equal(new URL(ap.url()).searchParams.get("next"), `/${panel}`);
    }
    await ap.goto(`${COMPANY_URL}/talentos`);
    assert.equal(pathOf(ap), "/commandos/login", `/talentos → ${pathOf(ap)}`);
    assert.equal(await fetchStatus(ap, "/api/commandos/users/export"), 401);
    // An outside address in `next` is ignored.
    await ap.goto(`${COMPANY_URL}/commandos/login?next=${encodeURIComponent("//example.com/x")}`);
    assert.equal(await ap.locator('input[name="next"]').count(), 0);
    await anon.close();
  });

  await step("signing in from a product's address returns to that product", async () => {
    const c2 = await browser.newContext();
    const p2 = await c2.newPage();
    await p2.goto(`${COMPANY_URL}/dealflow-ai/login`);
    await p2.fill('input[name="email"]', COMPANY_EMAIL);
    await p2.fill('input[name="password"]', COMPANY_PASSWORD);
    await Promise.all([p2.waitForURL((u) => u.pathname.startsWith("/dealflow-ai") && !u.pathname.endsWith("/login"), { timeout: 60_000 }), p2.press('input[name="password"]', "Enter")]);
    await c2.close();
  });

  await step("sign out everywhere: the Workspace and the products are closed", async () => {
    await page.goto(`${COMPANY_URL}/commandos/settings/security`);
    await Promise.all([page.waitForURL((u) => u.pathname === "/commandos/login", { timeout: 60_000 }), page.locator("#security-signout-all").click()]);
    for (const path of ["/commandos", "/talentos", "/sprintos", "/dealflow-ai", "/commandos/users"]) {
      await page.goto(`${COMPANY_URL}${path}`);
      assert.equal(pathOf(page), "/commandos/login", `${path} → ${pathOf(page)}`);
    }
    assert.equal(await fetchStatus(page, "/api/commandos/users/export"), 401);
  });
  await ctx.close();

  if (BASE && OWNER_EMAIL && OWNER_PASSWORD) {
    const octx = await browser.newContext();
    const op = await octx.newPage();
    op.on("pageerror", (e) => pageErrors.push(`${pathOf(op)}: ${e.message}`));
    await step("platform owner: exactly one Platform Console link in the sidebar, and it opens the product", async () => {
      await signIn(op, BASE, OWNER_EMAIL, OWNER_PASSWORD);
      await op.goto(`${BASE}/commandos`);
      await sidebar(op).waitFor();
      const links = sidebar(op).locator('a[href^="/console"]');
      assert.equal(await links.count(), 1);
      assert.equal(await links.getAttribute("href"), "/console");
      await links.click();
      await op.waitForURL((u) => u.pathname === "/console", { timeout: 30_000 });
      await op.getByRole("heading", { name: "Dashboard" }).waitFor();
    });
    await step("platform owner: settings hub shows the Platform Console card next to the company cards", async () => {
      await op.goto(`${BASE}/commandos/settings`);
      await op.locator('[data-settings-card="platform.panel"]').waitFor();
      await op.locator('[data-settings-card="company.billing"]').waitFor();
    });
    await octx.close();
  } else {
    console.log("  (skipping platform-owner checks: set PANEL_BASE_URL, OWNER_EMAIL, OWNER_PASSWORD)");
  }

  await step("no page errors", async () => {
    assert.deepEqual(pageErrors, []);
  });
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
