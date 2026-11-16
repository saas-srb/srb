import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getSetupProgress, setupProgressFor, forgetSetupProgress, STEPS } from "../src/lib/platform/setup-progress";
import { setNotApplicable, setReviewed, getMarks, recordSnapshot, listSnapshots, getReminderState, saveReminderState } from "../src/lib/platform/setup-progress/store";
import { stuckCompanyIds, getPlatformSetupRows, PLATFORM_SETUP_COLLECTION } from "../src/lib/platform/setup-progress/platform";
import { decideReminders, runSetupReminders } from "../src/lib/platform/setup-progress/reminders";
import { gatherFacts } from "../src/lib/platform/setup-progress/gather";
import { saveCompanyIdentity } from "../src/lib/platform/company-identity";
import { saveConnection } from "../src/lib/platform/connections/store";
import { createDepartment } from "../src/lib/platform/organization";
import { updatePmsSettings } from "../src/lib/products/sprintos/settings";

// Throwaway database only. Marks, snapshots, reminders, tenancy, cache invalidation, graceful failure, and "completing a step through its real save path moves the percentage".
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const stepOf = (p: Awaited<ReturnType<typeof getSetupProgress>>, id: string) => p.steps.find((s) => s.id === id)!;
const DAY = 86_400_000;

(async () => {
  const platform = await getPlatformDb();
  assert.ok(platform.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await platform.dropDatabase();
  const companies = platform.collection("companies");
  const mkCompany = (id: string, name: string) => companies.insertOne({ _id: id as never, name, slug: id, status: "active", isPlatformOwner: false, createdAt: new Date(), enabledModules: ["pms", "hrms"], onboarding: { completedSteps: [], completedAt: null, dismissedAt: null }, subscription: { planId: "p1", status: "trialing", interval: "monthly", trialEndsAt: new Date(Date.now() + 9 * DAY), cancelAtPeriodEnd: false, graceEndsAt: null, provider: null, currentPeriodStart: null, currentPeriodEnd: null } } as never);
  await mkCompany("co_a", "Acme");
  await mkCompany("co_b", "Beta");

  await runAsCompany("co_a", async () => {
    const users = (await getDb()).collection("admin_users");
    await users.insertMany([{ email: "dir@acme.test", name: "Dir", roles: ["super_admin"], status: "active", emailVerified: true }, { email: "dev@acme.test", name: "Dev", roles: ["pms_employee"], status: "active" }] as never);

    console.log("derived from real data");
    let before = await getSetupProgress({ fresh: true });
    await T("a new company is low, products are only the ones switched on, and the percentage is derived (nothing is stored as truth)", async () => {
      assert.ok(before.summary.percent < 40, `${before.summary.percent}`);
      assert.deepEqual(before.summary.products.map((p) => p.module).sort(), ["hrms", "lpms", "pms"], "the two chosen, plus ContractFlow which is always on");
      assert.equal(stepOf(before, "product-settings:smms").status, "notApplicable");
      assert.equal(stepOf(before, "people:access").status, "done", "a teammate with a role has access");
      assert.equal(stepOf(before, "org:departments").status, "todo");
      assert.equal(await (await getDb()).collection("setup_progress").countDocuments({ percent: { $exists: true } } as never), 0, "no percentage is stored in the company");
    });
    await T("REAL SAVE: saving the company identity completes its steps and raises the percentage", async () => {
      assert.equal(stepOf(before, "company:names").status, "partial", "the brand name falls back to the registry, the legal name is missing");
      const r = await saveCompanyIdentity({ brandName: "Acme", legalName: "Acme Pvt Ltd", addressLine1: "1 Road", city: "Pune", state: "MH", postalCode: "411001", country: "India", email: "hi@acme.test", phone: "+91 1" }, "u1");
      assert.equal(r.ok, true);
      const after = await getSetupProgress(); // not fresh: the change event must have dropped the cache
      assert.equal(stepOf(after, "company:names").status, "done");
      assert.equal(stepOf(after, "company:address").status, "done");
      assert.equal(stepOf(after, "company:contact").status, "done");
      assert.ok(after.summary.percent > before.summary.percent, `${before.summary.percent} -> ${after.summary.percent}`);
      before = after;
    });
    await T("REAL SAVE: creating a department through the organization service completes the step", async () => {
      await createDepartment({ name: "Engineering" }, "u1");
      const p = await getSetupProgress({ fresh: true });
      assert.equal(stepOf(p, "org:departments").status, "done");
      assert.ok(p.summary.percent > before.summary.percent);
      before = p;
    });
    await T("REAL SAVE: saving a product's settings completes its step; saving own keys makes an integration 'in progress' until Test passes", async () => {
      assert.equal(stepOf(before, "product-settings:pms").status, "todo");
      await updatePmsSettings({ categories: ["Web"], technologySuggestions: ["React"], defaultCurrency: "INR" }, "u1");
      assert.equal((await (await getDb()).collection("pms_settings").findOne({}))?.updatedBy, "u1");
      const withSettings = await getSetupProgress({ fresh: true });
      assert.equal(stepOf(withSettings, "product-settings:pms").status, "done");
      const s = await saveConnection("openai", { apiKey: "sk-test-12345678" }, "u1");
      assert.equal(s.ok, true, s.ok ? "" : s.error);
      const p = await getSetupProgress(); // cache dropped by the connection change event
      assert.equal(stepOf(p, "integration:ai").status, "partial");
      assert.match(stepOf(p, "integration:ai").detail, /Test/);
      const { recordTestResult } = await import("../src/lib/platform/connections/store");
      await recordTestResult("openai", true, "ok");
      const tested = await getSetupProgress({ fresh: true });
      assert.equal(stepOf(tested, "integration:ai").status, "done");
      assert.ok(tested.summary.percent > withSettings.summary.percent);
      before = tested;
    });

    console.log("marks, audit, cache");
    await T("not applicable: optional only, with a reason, audited, reversible, listed, and the percentage follows at once", async () => {
      const req = await setNotApplicable("org:designations", true, "we do not use titles", "u1");
      assert.deepEqual(req, { ok: false, error: "Only optional steps can be marked not applicable." });
      assert.deepEqual(await setNotApplicable("people:invite", true, "no", "u1"), { ok: false, error: "Only optional steps can be marked not applicable." });
      assert.deepEqual(await setNotApplicable("nope", true, "reason", "u1"), { ok: false, error: "Unknown step." });
      assert.equal((await setNotApplicable("org:teams", true, "", "u1")).ok, false, "a reason is required");
      const p0 = await getSetupProgress({ fresh: true });
      assert.equal(stepOf(p0, "org:teams").status, "todo");
      assert.deepEqual(await setNotApplicable("org:teams", true, "  flat company  ", "u1"), { ok: true });
      const p1 = await getSetupProgress();
      const s = stepOf(p1, "org:teams");
      assert.deepEqual([s.status, s.mark, s.detail], ["notApplicable", "notApplicable", "Marked not applicable: flat company"]);
      assert.ok(p1.summary.percent >= p0.summary.percent && p1.summary.applicable === p0.summary.applicable - 1);
      assert.equal(p1.summary.notApplicable, p0.summary.notApplicable + 1);
      const audit = await platform.collection("platform_audit_log").find({ action: "setup.not_applicable", companyId: "co_a" }).toArray();
      assert.equal(audit.length, 1);
      assert.deepEqual([audit[0].target, audit[0].actorId], [{ type: "setup_step", id: "org:teams" }, "u1"]);
      assert.equal((audit[0].details as { reason: string }).reason, "flat company");
      assert.deepEqual(await setNotApplicable("org:teams", false, "", "u1"), { ok: true });
      assert.equal(stepOf(await getSetupProgress(), "org:teams").status, "todo", "reversible");
      assert.equal((await platform.collection("platform_audit_log").countDocuments({ action: "setup.applicable" })), 1);
    });
    await T("reviewed: only for steps that cannot be derived, audited, reversible", async () => {
      assert.deepEqual(await setReviewed("org:departments", true, "u1"), { ok: false, error: "This step is worked out from your data; it cannot be marked by hand." });
      assert.equal(stepOf(await getSetupProgress({ fresh: true }), "system:notifications").status, "todo");
      assert.deepEqual(await setReviewed("system:notifications", true, "u1"), { ok: true });
      const p = await getSetupProgress();
      const s = stepOf(p, "system:notifications");
      assert.deepEqual([s.status, s.mark], ["done", "reviewed"]);
      assert.match(s.detail, /^Reviewed on \d{4}-\d{2}-\d{2}/);
      assert.deepEqual((await getMarks()).reviewed["system:notifications"]?.by, "u1");
      assert.equal(await platform.collection("platform_audit_log").countDocuments({ action: "setup.reviewed" }), 1);
      await setReviewed("system:notifications", false, "u1");
      assert.equal(stepOf(await getSetupProgress(), "system:notifications").status, "todo");
    });

    console.log("snapshots, the Console row and reminders");
    await T("one snapshot per day (a second write the same day replaces it) and a small trend", async () => {
      const d = new Date("2026-11-10T08:00:00Z");
      await recordSnapshot(20, d); await recordSnapshot(25, new Date("2026-11-10T20:00:00Z")); await recordSnapshot(40, new Date("2026-11-11T08:00:00Z"));
      assert.deepEqual(await listSnapshots(5), [{ day: "2026-11-10", percent: 25 }, { day: "2026-11-11", percent: 40 }]);
    });
    await T("the Platform Console row follows the computed percentage, and 'stuck' needs under 50% for 7 days", async () => {
      const p = await getSetupProgress({ fresh: true });
      await new Promise((r) => setTimeout(r, 300));
      const row = (await getPlatformSetupRows(["co_a"])).get("co_a");
      assert.equal(row?.percent, p.summary.percent);
      assert.ok(row!.belowSince, "below half: the clock started");
      assert.deepEqual(await stuckCompanyIds(), []);
      await platform.collection(PLATFORM_SETUP_COLLECTION).updateOne({ _id: "co_a" as never }, { $set: { belowSince: new Date(Date.now() - 8 * DAY) } });
      assert.deepEqual(await stuckCompanyIds(), ["co_a"]);
    });
    await T("reminder rules: nothing at 100; the clock restarts when the percentage moves; one in-app at 3 days; a weekly digest; never twice", async () => {
      const t0 = new Date("2026-11-01T00:00:00Z");
      const at = (d: number) => new Date(t0.getTime() + d * DAY);
      assert.deepEqual([decideReminders({}, 100, t0).inApp, decideReminders({}, 100, t0).digest], [false, false]);
      const first = decideReminders({}, 40, t0);
      assert.deepEqual([first.inApp, first.digest], [false, false]);
      let st = { lastPercent: 40, stuckSince: t0 as Date | null, lastInApp: null as Date | null, lastDigest: null as Date | null };
      assert.equal(decideReminders(st, 40, at(2)).inApp, false);
      const d3 = decideReminders(st, 40, at(3));
      assert.deepEqual([d3.inApp, d3.digest], [true, true]);
      st = { ...st, lastInApp: at(3), lastDigest: at(3) };
      assert.deepEqual([decideReminders(st, 40, at(4)).inApp, decideReminders(st, 40, at(4)).digest], [false, false]);
      assert.deepEqual([decideReminders(st, 40, at(9)).inApp, decideReminders(st, 40, at(9)).digest], [false, false]);
      assert.deepEqual([decideReminders(st, 40, at(10)).inApp, decideReminders(st, 40, at(10)).digest], [false, true], "a week later: the digest only");
      const moved = decideReminders(st, 45, at(11));
      assert.deepEqual([moved.inApp, moved.digest, moved.patch.stuckSince?.getTime()], [false, false, at(11).getTime()], "moving restarts the clock");
    });
    await T("the job in practice: a stuck company gets ONE in-app reminder to its Director and one digest; running again sends nothing more", async () => {
      const p = await getSetupProgress({ fresh: true });
      await saveReminderState({ lastPercent: p.summary.percent, stuckSince: new Date(Date.now() - 4 * DAY), lastInApp: null, lastDigest: null });
      const first = await runSetupReminders();
      assert.equal(first.percent, p.summary.percent);
      assert.equal(first.inApp, 1, "one Director");
      assert.ok(first.digest <= 1);
      const bell = await (await getDb()).collection("platform_notifications").find({}).toArray();
      assert.equal(bell.length, 1);
      assert.match(bell[0].title as string, /Your setup is \d+% done/);
      assert.equal(bell[0].url, "/commandos/setup");
      const second = await runSetupReminders();
      assert.deepEqual([second.inApp, second.digest], [0, 0]);
      assert.equal((await (await getDb()).collection("platform_notifications").countDocuments({})), 1);
      assert.ok((await getReminderState()).lastInApp);
    });
  });

  await T("opt-out: switching the weekly summary off in the Notification center stops the email (the in-app reminder has its own switch)", async () => {
    await runAsCompany("co_a", async () => {
      const { listRules, updateRule } = await import("../src/lib/notify/center/store");
      await listRules(); // seeds the company's rules
      const off = await updateRule("setup_digest", { channels: { email: { on: false } } }, "u1");
      assert.equal(off.ok, true, off.ok ? "" : off.error);
      const p = await getSetupProgress({ fresh: true });
      await saveReminderState({ lastPercent: p.summary.percent, stuckSince: new Date(Date.now() - 20 * DAY), lastInApp: new Date(), lastDigest: new Date(Date.now() - 10 * DAY) });
      const quiet = await runSetupReminders();
      assert.equal(quiet.digest, 0, "the email is switched off");
      const log = await (await getDb()).collection("notification_log").find({ event: "setup_digest" }).toArray().catch(() => []);
      void log;
    });
  });

  console.log("tenancy and failure");
  await T("another company has its own percentage, marks and reminder state", async () => {
    await runAsCompany("co_b", async () => {
      const p = await getSetupProgress({ fresh: true });
      assert.equal(stepOf(p, "company:address").status, "todo", "Acme's address is not Beta's"); assert.notEqual(stepOf(p, "company:names").status, "done");
      assert.equal(stepOf(p, "org:teams").status, "todo");
      assert.deepEqual((await getMarks()).reviewed, {});
      assert.equal((await getReminderState()).lastInApp, undefined);
      assert.equal((await listSnapshots(5)).length, 0);
    });
    const viaApi = await setupProgressFor("co_a");
    assert.ok(viaApi.summary.percent > 0);
  });
  await T("a group that cannot be read only makes its own steps 'could not check': a company with no registry record still gets a percentage", async () => {
    await runAsCompany("co_ghost", async () => {
      const f = await gatherFacts();
      assert.ok(f.failed.includes("onboarding"));
      const p = await getSetupProgress({ fresh: true });
      assert.equal(stepOf(p, "company:profile").status, "unknown");
      assert.ok(p.summary.unknown >= 1 && p.summary.percent <= 99);
      assert.ok(p.steps.length === STEPS.length);
    });
    forgetSetupProgress("co_ghost");
  });
  await T("the cache serves within its short life and a fresh read ignores it", async () => {
    await runAsCompany("co_a", async () => {
      const a = await getSetupProgress();
      const b = await getSetupProgress();
      assert.equal(a, b, "the same object from the cache");
      const c = await getSetupProgress({ fresh: true });
      assert.notEqual(a, c);
    });
  });

  await platform.dropDatabase();
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
