/**
 * Registration -> Workspace -> onboarding in the Workspace, against a real
 * MongoDB in a THROWAWAY database that is dropped at the end:
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/flow_test_$(date +%s) EMAIL_PROVIDER=console PLATFORM_ROOT_DOMAIN=localhost \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-signup-onboarding-flow.ts
 *
 * Checks:
 *  - a fresh sign-up in open mode (no e-mail gate) creates the company at once and
 *    hands the owner off to /commandos (not a setup wizard); the owner starts unverified;
 *  - approval mode stores the request straight away (no e-mail step); approving creates the same company with the same fresh setup state;
 *  - the sign-in landing (`postLoginTarget`, pure): an owner whose setup is
 *    neither completed nor skipped lands on /commandos/onboarding at sign-in
 *    (an explicit `next` wins); completed/skipped owners, invited employees and
 *    the platform owner's company never do; /commandos itself never redirects;
 *    the "Complete setup" strip shows until setup is completed (skipped included);
 *  - the real onboarding state (`companies.onboarding`) drives it, including an
 *    invited employee accepting an invitation;
 *  - the sign-up form asks only for what creating the account needs.
 */
import assert from "node:assert/strict";
import { sampleBusinessInput } from "@/lib/platform/business-taxonomy";
import fs from "node:fs";
import path from "node:path";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION } from "@/lib/platform/tenancy/companies";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { approveSignup, consumeHandoff, startSignup } from "@/lib/platform/signup";
import { setSignupMode } from "@/lib/platform/settings";
import { acceptInvitation, inviteTeammate } from "@/lib/platform/invitations";
import { getOnboarding, markOnboardingStep, skipOnboarding } from "@/lib/platform/onboarding/state";
import { ONBOARDING_STEPS } from "@/lib/platform/onboarding/catalog";
import { ONBOARDING_PATH, WORKSPACE_HOME, isOnboardingOwner, postLoginTarget, setupIsOpen, showSetupStrip, type SetupFacts } from "@/lib/platform/onboarding/gate";
import { getDb } from "@/lib/mongodb";

const uri = process.env.MONGODB_URI ?? "";
const dbName = uri.split("/").pop()?.split("?")[0] ?? "";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri) || !dbName.includes("test")) {
  console.error(`Refusing to run: MONGODB_URI must be a local throwaway database with "test" in its name (got "${dbName}").`);
  process.exit(1);
}
if (process.env.EMAIL_PROVIDER !== "console") {
  console.error("Refusing to run: set EMAIL_PROVIDER=console so no real email is sent.");
  process.exit(1);
}

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Capture what the console e-mail adapter prints instead of sending.
const sentEmails: string[] = [];
const origLog = console.log;
console.log = (...args: unknown[]) => {
  const line = args.map(String).join(" ");
  if (line.includes("[email:console]")) sentEmails.push(line);
  else origLog(...args);
};
const emailsTo = (addr: string) => sentEmails.filter((e) => e.includes(`to=${addr}`));
const linkIn = (mail: string, re: RegExp) => mail.match(re)?.[1] ?? "";

const open = { completedAt: null, dismissedAt: null };
const landing = (over: Partial<SetupFacts & { requestedNext: string | null }> = {}) => postLoginTarget({ isOwner: true, isPlatformOwnerCompany: false, state: open, requestedNext: null, ...over });

async function run() {
  const db = await getPlatformDb();
  await setSignupMode("open", "test");

  console.log("sign-up form");
  await check("the sign-up form asks only for company, address, owner name, e-mail, password and terms - no setup steps", () => {
    const form = fs.readFileSync(path.join(process.cwd(), "src/app/(platform)/signup/SignupForm.tsx"), "utf8");
    const names = [...form.matchAll(/name="([A-Za-z]+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(names, ["acceptTerms", "companyName", "email", "name", "password", "slug"]);
    assert.ok(!/useState\(\s*(0|1)\s*\)[^\n]*step/i.test(form) && !/\bstep\b/i.test(form.replace(/\/\/.*$/gm, "")), "no multi-step flow in the form");
  });

  console.log("fresh sign-up -> handoff -> /commandos");
  let freshCompanyId = "";
  await check("an open-mode sign-up creates the company at once and a handoff whose next is /commandos", async () => {
    const started = await startSignup({ companyName: "Fresh Co", slug: "freshco", name: "Fiona Founder", email: "fiona@fresh.test", password: "correct-horse-battery", businessCategories: sampleBusinessInput().categories, businessSubCategories: sampleBusinessInput().subCategories, acceptTerms: true }, { hostHint: "localhost:3000", clientKey: "t1" });
    assert.ok(started.ok && started.kind === "created", JSON.stringify(started));
    assert.equal(await db.collection("pending_signups").countDocuments({ email: "fiona@fresh.test" }), 0, "no pending sign-up / confirmation step in open mode");
    const url = new URL(started.redirectTo);
    assert.equal(url.host, "freshco.localhost:3000");
    assert.equal(url.pathname, "/commandos/handoff");
    const company = await db.collection(COMPANIES_COLLECTION).findOne({ slug: "freshco" });
    freshCompanyId = String(company!._id);
    const handoff = await consumeHandoff(url.searchParams.get("token")!, freshCompanyId);
    assert.ok(handoff, "handoff is valid on the new company");
    assert.equal(handoff!.next, "/commandos", "the handoff lands on the Workspace home, where onboarding takes over");
    assert.equal(await consumeHandoff(url.searchParams.get("token")!, freshCompanyId), null, "single use");
  });
  await check("the same e-mail may sign up another company (user e-mail is unique per company); a taken address is refused", async () => {
    const again = await startSignup({ companyName: "Fresh Two", slug: "freshco", name: "Other Person", email: "other@fresh.test", password: "correct-horse-battery", businessCategories: sampleBusinessInput().categories, businessSubCategories: sampleBusinessInput().subCategories, acceptTerms: true }, { hostHint: "localhost:3000", clientKey: "t1b" });
    assert.ok(!again.ok && again.errors.slug, JSON.stringify(again));
    const second = await startSignup({ companyName: "Fresh Two", slug: "freshtwo", name: "Fiona Founder", email: "fiona@fresh.test", password: "correct-horse-battery", businessCategories: sampleBusinessInput().categories, businessSubCategories: sampleBusinessInput().subCategories, acceptTerms: true }, { hostHint: "localhost:3000", clientKey: "t1c" });
    assert.ok(second.ok && second.kind === "created");
  });
  await check("the owner is a Super Admin and the new company's setup is open (nothing completed, not skipped)", async () => {
    const owner = await db.collection("admin_users").findOne({ companyId: freshCompanyId as never, email: "fiona@fresh.test" });
    assert.deepEqual(owner?.roles, ["super_admin"]);
    assert.equal(owner?.emailVerified, false, "a new sign-up starts unverified");
    const { state, company } = await runAsCompany(freshCompanyId, () => getOnboarding());
    assert.equal(company.isPlatformOwner, false);
    assert.deepEqual(state, { completedSteps: [], completedAt: null, dismissedAt: null });
    assert.equal(postLoginTarget({ isOwner: isOnboardingOwner(owner!.roles), isPlatformOwnerCompany: Boolean(company.isPlatformOwner), state }), ONBOARDING_PATH, "signing in starts onboarding");
  });

  console.log("admin approval path");
  await check("approval mode stores the request without any e-mail step; approving creates the same company with the same open setup state and a sign-in link to the Workspace", async () => {
    await setSignupMode("approval", "test");
    const started = await startSignup({ companyName: "Approved Co", slug: "approvedco", name: "Ann Approved", email: "ann@approved.test", password: "correct-horse-battery", businessCategories: sampleBusinessInput().categories, businessSubCategories: sampleBusinessInput().subCategories, acceptTerms: true }, { hostHint: "localhost:3000", clientKey: "t2" });
    assert.ok(started.ok && started.kind === "awaiting_approval", JSON.stringify(started));
    assert.equal(emailsTo("ann@approved.test").length, 0, "no confirmation e-mail before approval");
    assert.equal(await db.collection("companies").countDocuments({ slug: "approvedco" }), 0, "nothing is created before approval");
    const pending = await db.collection("pending_signups").findOne({ slug: "approvedco", status: "awaiting_approval" });
    assert.ok(pending, "the request waits in the queue");
    const res = await approveSignup(String(pending!._id), { hostHint: "localhost:3000" });
    assert.ok(res.ok, res.ok ? "" : res.error);
    const mail = emailsTo("ann@approved.test").find((m) => m.includes("/commandos/login"));
    assert.ok(mail, "the approval e-mail links to the Workspace sign-in");
    const approvedOwner = await db.collection("admin_users").findOne({ companyId: (res as { companyId: string }).companyId as never, email: "ann@approved.test" });
    assert.equal(approvedOwner?.emailVerified, false, "an approved owner starts unverified");
    const { state } = await runAsCompany((res as { companyId: string }).companyId, () => getOnboarding());
    assert.equal(setupIsOpen({ isOwner: true, isPlatformOwnerCompany: false, state }), true);
    assert.equal(landing({ state }), ONBOARDING_PATH, "signing in lands on the onboarding wizard");
    await setSignupMode("open", "test");
  });

  console.log("skipped setup");
  await check("after \"Skip for now\" the stored state still has a complete shape (the wizard and strip read completedSteps)", async () => {
    await runAsCompany(freshCompanyId, () => skipOnboarding());
    const { state } = await runAsCompany(freshCompanyId, () => getOnboarding());
    assert.deepEqual(state.completedSteps, []);
    assert.ok(state.dismissedAt, "dismissedAt is set");
    assert.equal(state.completedAt, null);
    // Leave the shared fresh company exactly as the later checks expect it: setup open.
    await db.collection("companies").updateOne({ _id: freshCompanyId as never }, { $unset: { onboarding: "" } });
  });

  console.log("sign-in landing (pure)");
  const done = new Date();
  await check("fresh company and an existing never-finished company: owner lands on /commandos/onboarding", () => {
    assert.equal(landing(), ONBOARDING_PATH);
    assert.equal(landing({ state: { completedAt: null, dismissedAt: null } }), ONBOARDING_PATH, "same for companies that predate onboarding");
    assert.equal(WORKSPACE_HOME, "/commandos");
  });
  await check("skipped or completed setup lands on the dashboard", () => {
    assert.equal(landing({ state: { completedAt: null, dismissedAt: done } }), WORKSPACE_HOME);
    assert.equal(landing({ state: { completedAt: done, dismissedAt: null } }), WORKSPACE_HOME);
  });
  await check("an explicit valid `next` (deep link, product login) is honoured, never overridden", () => {
    for (const next of ["/talentos", "/commandos/crm/leads", "/commandos/settings/billing", "/commandos"]) assert.equal(landing({ requestedNext: next }), next);
  });
  await check("invited employees, non-Super-Admin roles and the platform owner's company never land on onboarding", () => {
    for (const roles of [["employee"], ["pms_employee", "workspace_member"], ["hr", "employee", "chat_hr"], []]) assert.equal(landing({ isOwner: isOnboardingOwner(roles) }), WORKSPACE_HOME, roles.join(","));
    assert.equal(landing({ isPlatformOwnerCompany: true }), WORKSPACE_HOME);
    assert.equal(isOnboardingOwner(["super_admin"]), true);
  });
  await check("the strip: owner of a customer company until setup is COMPLETED (skipped still shows); nobody else", () => {
    const f = (over: Partial<SetupFacts>): SetupFacts => ({ isOwner: true, isPlatformOwnerCompany: false, state: open, ...over });
    assert.equal(showSetupStrip(f({})), true);
    assert.equal(showSetupStrip(f({ state: { completedAt: null, dismissedAt: done } })), true, "skipped: strip stays");
    assert.equal(showSetupStrip(f({ state: { completedAt: done, dismissedAt: null } })), false);
    assert.equal(showSetupStrip(f({ isOwner: false })), false);
    assert.equal(showSetupStrip(f({ isPlatformOwnerCompany: true })), false);
    assert.equal(setupIsOpen(f({ state: { completedAt: null, dismissedAt: done } })), false, "skipped: no login landing");
  });
  await check("no page redirect decision exists on /workspace: the dashboard and the gate module have none", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src/app/commandos/(protected)/page.tsx"), "utf8");
    assert.ok(!page.includes("/commandos/onboarding"), "the dashboard has no onboarding redirect");
    assert.ok(!page.includes("onboardingGateTarget"));
    const gate = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/onboarding/gate.ts"), "utf8");
    assert.ok(!/onboardingGateTarget/.test(gate), "the old page gate is gone");
  });

  console.log("the real state drives the decision");
  await check("finishing the wizard's steps stops the login landing and the strip; skipping stops only the landing", async () => {
    const facts = async (id: string): Promise<SetupFacts> => {
      const { company, state } = await runAsCompany(id, () => getOnboarding());
      return { isOwner: true, isPlatformOwnerCompany: Boolean(company.isPlatformOwner), state };
    };
    assert.equal(postLoginTarget({ ...(await facts(freshCompanyId)) }), ONBOARDING_PATH);
    for (const step of ONBOARDING_STEPS.slice(0, -1)) await runAsCompany(freshCompanyId, () => markOnboardingStep(step.key));
    assert.equal(postLoginTarget({ ...(await facts(freshCompanyId)) }), ONBOARDING_PATH, "one step to go: still open");
    assert.equal(showSetupStrip(await facts(freshCompanyId)), true);
    await runAsCompany(freshCompanyId, () => markOnboardingStep(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1].key));
    assert.equal(postLoginTarget({ ...(await facts(freshCompanyId)) }), WORKSPACE_HOME, "all steps done: dashboard");
    assert.equal(showSetupStrip(await facts(freshCompanyId)), false, "completed: no strip");
    const approved = await db.collection(COMPANIES_COLLECTION).findOne({ slug: "approvedco" });
    const aid = String(approved!._id);
    await runAsCompany(aid, () => skipOnboarding());
    const sk = await facts(aid);
    assert.equal(postLoginTarget(sk), WORKSPACE_HOME, "skipped: no login landing");
    assert.equal(showSetupStrip(sk), true, "skipped: the strip keeps reminding");
  });
  await check("an invitation accepted in the new company makes a teammate who is not routed to onboarding", async () => {
    await db.collection(COMPANIES_COLLECTION).updateOne({ _id: freshCompanyId as never }, { $set: { "onboarding.completedSteps": [], "onboarding.completedAt": null, "onboarding.dismissedAt": null } });
    const owner = await db.collection("admin_users").findOne({ companyId: freshCompanyId as never, email: "fiona@fresh.test" });
    const invited = await runAsCompany(freshCompanyId, () => inviteTeammate({ email: "dev@fresh.test", name: "Dev", preset: "developer" }, { id: String(owner!._id), email: "fiona@fresh.test" }, "http://freshco.localhost:3000"));
    assert.ok(invited.ok, invited.ok ? "" : invited.error);
    const token = linkIn(emailsTo("dev@fresh.test")[0], /workspace\/invite\?token=([a-f0-9]+)/);
    assert.ok(token);
    const accepted = await runAsCompany(freshCompanyId, () => acceptInvitation(token, { name: "Dev", password: "another-long-password" }));
    assert.ok(accepted.ok, accepted.ok ? "" : accepted.error);
    const user = await runAsCompany(freshCompanyId, async () => (await getDb()).collection("admin_users").findOne({ email: "dev@fresh.test" }));
    assert.ok(user && !isOnboardingOwner(user.roles as string[]), "teammate is not the owner");
    const { company, state } = await runAsCompany(freshCompanyId, () => getOnboarding());
    assert.equal(setupIsOpen({ isOwner: true, isPlatformOwnerCompany: false, state }), true, "the company's setup is still open for its owner");
    assert.equal(postLoginTarget({ isOwner: isOnboardingOwner(user.roles as string[]), isPlatformOwnerCompany: Boolean(company.isPlatformOwner), state }), WORKSPACE_HOME, "but the teammate goes straight to the dashboard");
  });

  console.log("wiring");
  await check("login and handoff use the landing rule; the wizard, settings and upgrade pages sit under /workspace; handoff and approval land in the Workspace", () => {
    const root = process.cwd();
    const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
    assert.ok(read("src/app/commandos/login/actions.ts").includes("loginLanding") && read("src/app/commandos/handoff/route.ts").includes("loginLanding"), "login and handoff share the one landing rule");
    assert.ok(!read("src/app/commandos/(protected)/onboarding/page.tsx").includes('redirect("/commandos")') || read("src/app/commandos/(protected)/onboarding/page.tsx").includes("super_admin"), "the wizard only bounces non-owners");
    assert.ok(fs.existsSync(path.join(root, "src/app/commandos/(protected)/onboarding/OnboardingWizard.tsx")));
    assert.ok(!read("src/lib/platform/signup.ts").includes('next: "/onboarding"'));
    assert.ok(read("src/lib/platform/signup.ts").includes('next: "/commandos"'));
  });
}

async function main() {
  origLog(`Scratch database: ${dbName}\n`);
  const client = await clientPromise;
  try {
    await run();
  } finally {
    await client.db().dropDatabase();
    await client.close();
    origLog(`\nDropped ${dbName}.`);
  }
  origLog(`${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
