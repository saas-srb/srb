/**
 * Browser test for the simple registration flow: public sign-up (no e-mail gate)
 * -> the owner is signed in on the new company's host and lands in the Workspace,
 * whose FIRST screen is the onboarding wizard (/commandos/onboarding) -> the
 * "Verify email" strip -> verification link -> finish the wizard -> the dashboard. Against a RUNNING server (production
 * build recommended) with EMAIL_PROVIDER=console and PLATFORM_ROOT_DOMAIN=localhost
 * (company hosts are <slug>.localhost):
 *
 *   BASE_URL=http://localhost:3006 \
 *   E2E_MONGODB_URI=mongodb://127.0.0.1:27099/<a "test" database the server uses> \
 *   node scripts/e2e/registration.e2e.mjs
 *
 * Needs a LOCAL "test" database (E2E_MONGODB_URI is refused otherwise): the
 * verification link is e-mailed by the server's console provider and only its
 * hash is stored, so the test swaps in a token it knows (in the company's
 * email_verifications collection), exactly as scripts/e2e/console.e2e.mjs seeds
 * its approval request. Creates one throwaway company (slug printed at the end) and
 * sign-up mode must be "open" (Platform settings).
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { chromium } from "playwright";
import { MongoClient } from "mongodb";

const BASE = process.env.BASE_URL;
const URI = process.env.E2E_MONGODB_URI;
if (!BASE || !URI) {
  console.error("Set BASE_URL (the platform site, where /signup lives) and E2E_MONGODB_URI (local test database).");
  process.exit(2);
}
const dbName = URI.split("/").pop()?.split("?")[0] ?? "";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URI) || !dbName.includes("test")) {
  console.error('E2E_MONGODB_URI must be a local database with "test" in its name.');
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

const stamp = Date.now().toString(36);
const SLUG = `reg${stamp}`;
const COMPANY = `Registration ${stamp}`;
const EMAIL = `owner@${SLUG}.test`;
const PASSWORD = "correct-horse-battery";
const TOKEN = randomBytes(32).toString("hex");
const pathOf = (page) => new URL(page.url()).pathname;

const mongo = await new MongoClient(URI).connect();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const pageErrors = [];

try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${pathOf(page)}: ${e.message}`));

  await step("the public sign-up form is one simple step: company, address, name, e-mail, password, terms", async () => {
    await page.goto(`${BASE}/signup`);
    await page.getByLabel("Company name").waitFor();
    // React's server-action plumbing adds hidden "$ACTION_*" inputs; they aren't form fields.
    const names = await page.locator("form [name]").evaluateAll((els) => els.map((e) => e.getAttribute("name")).filter((n) => n && !n.startsWith("$")).sort());
    assert.deepEqual(names, ["acceptTerms", "companyName", "email", "password", "slug"]);
    assert.equal(await page.getByRole("button", { name: /next|continue|step/i }).count(), 0, "no multi-step wizard on the form");
  });

  await step("submitting it creates the workspace at once (no e-mail confirmation) and lands on the onboarding wizard", async () => {
    await page.getByLabel("Company name").fill(COMPANY);
    await page.getByLabel("Workspace address").fill(SLUG);
    await page.getByLabel("Work email").fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.locator('input[name="acceptTerms"]').check();
    await page.getByRole("button", { name: "Create workspace" }).click();
    await page.waitForURL((u) => u.hostname.startsWith(`${SLUG}.`) && u.pathname === "/commandos/onboarding", { timeout: 90_000 });
    await page.getByRole("heading", { name: `Set up ${COMPANY}` }).waitFor();
    // It is the Workspace frame, not a standalone page.
    await page.locator('aside nav[aria-label="Workspace"]').waitFor();
    assert.equal(await page.getByText("My Operational Products").count(), 0, "the first screen after sign-up is onboarding, not the dashboard");
    assert.equal(await page.locator("#setup-banner").count(), 0, "no reminder banner on the wizard itself");
    assert.equal(await mongo.db().collection("pending_signups").countDocuments({ email: EMAIL }), 0, "no pending sign-up step");
    const owner = await mongo.db().collection("admin_users").findOne({ email: EMAIL });
    assert.equal(owner?.emailVerified, false, "the owner starts unverified");
  });

  await step("/commandos is never redirected: it shows the dashboard with the \"Complete setup\" strip; deep links show the strip too", async () => {
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/commandos`);
    await page.getByText("My Operational Products").waitFor();
    assert.equal(pathOf(page), "/commandos", "not redirected back to onboarding");
    await page.locator("#setup-banner").getByRole("link", { name: "Complete setup" }).waitFor();
    await page.goto(`${origin}/commandos/settings/billing`);
    assert.equal(pathOf(page), "/commandos/settings/billing");
    await page.locator("#setup-banner").waitFor();
    await Promise.all([page.waitForURL((u) => u.pathname === "/commandos/onboarding"), page.locator("#setup-banner-link").click()]);
  });

  await step("old /onboarding link still works", async () => {
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/onboarding`);
    assert.equal(pathOf(page), "/commandos/onboarding");
  });

  await step("the \"Verify email\" strip shows on the dashboard; clicking it sends the link and the strip says \"Check your inbox\"", async () => {
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/commandos`);
    await page.getByText("My Operational Products").waitFor();
    const strip = page.locator("#verify-banner");
    await strip.waitFor();
    assert.ok((await strip.textContent()).includes(EMAIL), "the strip shows the address");
    await strip.getByRole("button", { name: "Verify email" }).click();
    await strip.getByText("Check your inbox").waitFor({ timeout: 30_000 });
    assert.ok(await page.locator("#verify-banner-resend").isVisible(), "a Resend option is offered");
    // Still there on another page, and nothing is blocked.
    await page.goto(`${origin}/commandos/settings/billing`);
    await page.locator("#verify-banner").waitFor();
  });

  await step("the verification link shows a page and does NOT verify on load; the button verifies, the dashboard has no strip", async () => {
    const company = await mongo.db().collection("companies").findOne({ slug: SLUG });
    const doc = await mongo.db().collection("email_verifications").find({ companyId: company._id }).sort({ createdAt: -1 }).limit(1).next();
    assert.ok(doc, "a verification token was stored");
    assert.equal(doc.tokenHash.length, 64);
    // Only the hash of the e-mailed token is stored: swap in a token we know.
    await mongo.db().collection("email_verifications").updateOne({ _id: doc._id }, { $set: { tokenHash: createHash("sha256").update(TOKEN).digest("hex") } });
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/commandos/verify-email?token=${TOKEN}`);
    await page.getByRole("button", { name: "Verify my email" }).waitFor();
    assert.equal(await page.locator("#verify-banner").count(), 0, "no strip on the verification page");
    assert.equal((await mongo.db().collection("admin_users").findOne({ email: EMAIL })).emailVerified, false, "a bare GET does not verify");
    await page.getByRole("button", { name: "Verify my email" }).click();
    await page.waitForURL((u) => u.pathname === "/commandos", { timeout: 30_000 });
    await page.getByText("My Operational Products").waitFor();
    assert.equal(await page.locator("#verify-banner").count(), 0, "the strip is gone after verifying");
    assert.equal((await mongo.db().collection("admin_users").findOne({ email: EMAIL })).emailVerified, true);
    await page.goto(`${origin}/commandos/verify-email?token=${TOKEN}`);
    await page.getByText("This link has expired").waitFor();
  });

  await step("finishing the wizard (profile, departments, team, branding, products) lands on the dashboard", async () => {
    // Verifying the email leaves the owner on the dashboard (never the wizard): open the wizard from there, as a person would.
    await page.goto(`${new URL(page.url()).origin}/commandos/onboarding`);
    await page.locator("#ob-industry").selectOption({ index: 1 });
    await page.locator("#ob-size").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Save & continue" }).click();
    await page.getByText("Departments & designations", { exact: true }).first().waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Create & continue" }).click();
    await page.getByText("Invite your team", { exact: true }).first().waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByText("Branding", { exact: true }).first().waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Save & continue" }).click();
    await page.getByRole("button", { name: "Finish setup" }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Finish setup" }).click();
    await page.getByText("You're all set").waitFor({ timeout: 30_000 });
    await page.getByText("Go to your workspace", { exact: true }).click();
    await page.waitForURL((u) => u.pathname === "/commandos", { timeout: 30_000 });
    await page.getByText("My Operational Products").waitFor();
    assert.equal(await page.locator("#setup-banner").count(), 0, "finishing the wizard removes the strip");
  });

  await step("setup is recorded (completed), so /commandos now stays on the dashboard and the banner is gone", async () => {
    const company = await mongo.db().collection("companies").findOne({ slug: SLUG });
    assert.ok(company?.onboarding?.completedAt, "onboarding.completedAt is set");
    assert.equal(company.onboarding.completedSteps.length, 5);
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/commandos`);
    assert.equal(pathOf(page), "/commandos");
    await page.getByText("My Operational Products").waitFor();
    await page.goto(`${origin}/commandos/settings/billing`);
    assert.equal(await page.locator("#setup-banner").count(), 0);
    // Company setup stays reachable from the Company section to revisit.
    await page.locator('aside nav[aria-label="Workspace"] a[href="/commandos/onboarding"]').first().waitFor({ state: "attached" });
    assert.equal((await page.goto(`${origin}/commandos/onboarding`))?.status(), 200);
    assert.equal(pathOf(page), "/commandos/onboarding");
  });

  await step("a returning owner with completed setup signs in at /commandos/login and goes straight to the dashboard", async () => {
    const c2 = await browser.newContext();
    const p2 = await c2.newPage();
    const origin = new URL(page.url()).origin;
    await p2.goto(`${origin}/commandos/login`);
    await p2.fill('input[name="email"]', EMAIL);
    await p2.fill('input[name="password"]', PASSWORD);
    await Promise.all([p2.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 60_000 }), p2.press('input[name="password"]', "Enter")]);
    assert.equal(pathOf(p2), "/commandos");
    await c2.close();
  });

  await step("no page errors", async () => {
    assert.deepEqual(pageErrors, []);
  });
  console.log(`\n(throwaway company: ${SLUG} in ${dbName})`);
} finally {
  await browser.close();
  await mongo.close();
}
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
