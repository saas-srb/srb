/**
 * Plans & trials checks (catalogue management, price versions, guards,
 * audit, trial sweep, extend trial) against a throwaway database dropped at the end.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/plans_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-plans-trials.ts
 */
process.env.EMAIL_PROVIDER = "console";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { deletePlan, getDefaultPlan, getPlan, listPlans, movePlan, savePlan, setDefaultPlan, setPlanActive, validatePlanInput, type PlanInput } from "@/lib/platform/billing/plans";
import { planIntervals, planPrice, planPriceAtVersion, resolveTrialDays } from "@/lib/platform/billing/pricing";
import { effectiveSubscriptionStatus, trialDaysLeft } from "@/lib/platform/billing/lifecycle";
import { quoteCheckout } from "@/lib/platform/billing/quote";
import { startTrial, getCompanySubscription } from "@/lib/platform/billing/subscription";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { getBillingSettings, saveBillingSettings } from "@/lib/platform/billing/settings";
import { extendTrial, getTrialOverview, runTrialSweep } from "@/lib/platform/billing/trials";
import { parsePlanForm, planToFormValues, emptyPlanForm } from "../src/app/(platform)/console/plans/planFormValues";

const DAY = 86_400_000;
let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = <T>(a: T, b: T, msg: string) => {
  assert.deepEqual(a, b, msg);
  checks++;
};

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  _id: "pro",
  name: "Pro",
  description: "For pros",
  currency: "INR",
  intervals: ["monthly", "yearly"],
  prices: { monthly: 150_000, yearly: 1_500_000 },
  modules: ["hrms", "pms"],
  highlights: ["Unlimited projects"],
  flags: ["apiAccess"],
  limits: { seats: 20, aiTokensPerMonth: null, storageMb: 10_000, emailsPerMonth: 1_000, voiceMinutesPerMonth: 10, customDomains: 1, projects: 50 },
  trialDays: null,
  active: true,
  isDefault: false,
  ...over,
});

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  const audit = db.collection("platform_audit_log");
  const events = db.collection("subscription_events");
  const auditCount = (action: string) => audit.countDocuments({ action });

  // ---- pure helpers
  eq(planIntervals({}), ["monthly", "yearly"], "legacy plan offers both cycles");
  eq(planPrice({ priceMonthly: 100, priceYearly: 1000 }, "yearly"), 1000, "legacy yearly price");
  eq(planPrice({ priceMonthly: 100, priceYearly: 1000, intervals: ["monthly"], prices: { monthly: 100 } }, "yearly"), null, "disabled cycle has no price");
  eq(resolveTrialDays({ trialDays: null }, 21), 21, "blank trial days = platform default");
  eq(resolveTrialDays({ trialDays: 0 }, 21), 0, "0 trial days respected");
  const now = new Date();
  eq(effectiveSubscriptionStatus({ status: "trialing", trialEndsAt: new Date(now.getTime() - DAY), graceEndsAt: null }, 7, now).status, "grace", "ended trial → grace");
  eq(effectiveSubscriptionStatus({ status: "trialing", trialEndsAt: new Date(now.getTime() - 8 * DAY), graceEndsAt: null }, 7, now).status, "suspended", "ended trial + grace over → suspended");
  eq(effectiveSubscriptionStatus({ status: "trialing", trialEndsAt: new Date(now.getTime() - DAY), graceEndsAt: null }, 0, now).status, "suspended", "0 grace days → suspended");
  eq(trialDaysLeft(new Date(now.getTime() + 2.5 * DAY), now), 3, "days left rounds up");

  // ---- form parsing
  const form = { ...emptyPlanForm("INR"), id: "x1", name: "X", cycles: [{ id: "monthly" as const, enabled: true, price: "999.5" }, { id: "yearly" as const, enabled: false, price: "abc" }], customLimits: [{ key: "projects", value: "" }, { key: "", value: "" }] };
  const parsed = parsePlanForm(form);
  eq(parsed.errors, {}, "disabled cycle's bad price ignored; empty custom row ignored");
  eq(parsed.input.prices, { monthly: 99_950 }, "rupees → paise");
  eq(parsed.input.limits.projects, null, "blank custom limit = unlimited");
  eq(parsed.input.trialDays, null, "blank trial → null");
  ok("customLimits.0" in parsePlanForm({ ...form, customLimits: [{ key: "seats", value: "3" }] }).errors, "custom limit can't shadow a known one");

  // ---- validation
  ok("id" in validatePlanInput(base({ _id: "trial" }), "create"), "reserved id rejected");
  ok("intervals" in validatePlanInput(base({ intervals: [] }), "create"), "needs a cycle");
  ok("price.yearly" in validatePlanInput(base({ prices: { monthly: 1 } }), "create"), "enabled cycle needs a price");
  ok("limit.seats" in validatePlanInput(base({ limits: { seats: 0, aiTokensPerMonth: null, storageMb: null } }), "create"), "seats ≥ 1");
  ok("limit.Bad Key" in validatePlanInput(base({ limits: { seats: 1, aiTokensPerMonth: null, storageMb: null, "Bad Key": 1 } }), "create"), "custom key pattern");
  ok("flags" in validatePlanInput(base({ flags: ["nope"] }), "create"), "unknown flag");
  ok("currency" in validatePlanInput(base({ currency: "rupees" }), "create"), "currency code");
  ok("trialDays" in validatePlanInput(base({ trialDays: -1 }), "create"), "trial days range");

  // ---- seed + create
  const seeded = await listPlans();
  eq(seeded.map((p) => p._id), ["free", "starter", "growth", "business", "enterprise"], "seeded");
  ok(seeded.every((p) => p.priceVersion === 1 && p.priceHistory?.length === 1), "seeds carry price version 1");
  const created = await savePlan(base(), "create", "admin-1");
  ok(created.ok, "create ok");
  const pro = (await getPlan("pro"))!;
  eq(pro.sortOrder, 60, "new plan appended at the end");
  eq(pro.priceMonthly, 150_000, "legacy mirror written");
  eq(pro.limits.projects, 50, "custom limit stored");
  eq(pro.trialDays, null, "trial days blank stored as null");
  eq(await auditCount("plan.create"), 1, "create audited");
  const dup = await savePlan(base(), "create", "admin-1");
  ok(!dup.ok && dup.fieldErrors?.id, "duplicate id rejected");

  // ---- price versioning
  const company = randomUUID();
  const t0 = new Date();
  await db.collection("companies").insertOne({ _id: company as never, slug: "acme", name: "Acme", status: "active", isPlatformOwner: false, createdAt: t0, updatedAt: t0 });
  await db.collection("admin_users").insertOne({ _id: randomUUID() as never, companyId: company, email: "owner@acme.test", roles: ["super_admin"], createdAt: t0 });
  await db.collection("companies").updateOne({ _id: company as never }, { $set: { subscription: { planId: "pro", status: "active", interval: "monthly", priceVersion: 1, trialEndsAt: null, currentPeriodStart: t0, currentPeriodEnd: null, cancelAtPeriodEnd: false, graceEndsAt: null, provider: null, updatedAt: t0 } } });
  await db.collection("billing_plans").updateOne({ _id: "pro" as never }, { $set: { provider: { razorpay: { monthly: "plan_old" } } } });

  const nameOnly = await savePlan(base({ name: "Pro+" }), "update", "admin-1");
  ok(nameOnly.ok && !nameOnly.priceChanged, "non-price edit keeps the version");
  eq((await getPlan("pro"))!.priceVersion, 1, "still v1");
  const repriced = await savePlan(base({ name: "Pro+", prices: { monthly: 200_000, yearly: 1_500_000 } }), "update", "admin-2");
  ok(repriced.ok && repriced.priceChanged, "price edit flagged");
  const pro2 = (await getPlan("pro"))!;
  eq(pro2.priceVersion, 2, "bumped to v2");
  eq(pro2.priceHistory?.map((v) => v.version), [1, 2], "history kept");
  eq(pro2.priceHistory?.[0].provider?.razorpay?.monthly, "plan_old", "old provider plan id kept on v1");
  eq(pro2.provider, undefined, "provider ids cleared for new subscribers");
  eq(planPriceAtVersion(pro2, "monthly", 1), 150_000, "existing subscriber (v1) still pays the old price");
  eq(planPriceAtVersion(pro2, "monthly", 2), 200_000, "new price for v2");
  eq((await getCompanySubscription(company))?.priceVersion, 1, "subscription untouched by a price edit");
  const updAudit = await audit.findOne({ action: "plan.update", actorId: "admin-2" });
  eq((updAudit?.details as { priceVersion?: unknown })?.priceVersion, { from: 1, to: 2 }, "price change audited with versions");

  const monthlyOnly = await savePlan(base({ name: "Pro+", intervals: ["monthly"], prices: { monthly: 200_000 } }), "update", "admin-2");
  ok(monthlyOnly.ok && monthlyOnly.priceChanged, "dropping a cycle is a new version");
  eq(await quoteCheckout({ planId: "pro", interval: "yearly" }), null, "quote refuses a cycle the plan doesn't offer");
  eq((await quoteCheckout({ planId: "pro", interval: "monthly" }))?.subtotal, 200_000, "quote uses current price");

  // legacy doc without history
  await db.collection("billing_plans").insertOne({ _id: "legacy" as never, name: "Legacy", description: "", currency: "INR", priceMonthly: 500, priceYearly: 5000, modules: "all", limits: { seats: null, aiTokensPerMonth: null, storageMb: null }, trialDays: 14, active: true, isDefault: false, sortOrder: 70, createdAt: t0, updatedAt: t0 });
  const leg = await savePlan(base({ _id: "legacy", name: "Legacy", modules: "all", prices: { monthly: 600, yearly: 5000 } }), "update", "admin-1");
  ok(leg.ok, "legacy update ok");
  eq((await getPlan("legacy"))!.priceHistory?.map((v) => [v.version, v.prices.monthly, v.createdBy]), [[1, 500, "legacy"], [2, 600, "admin-1"]], "legacy prices recorded as v1");

  // ---- guards
  const deact = await setPlanActive("pro", false, "admin-1");
  ok(!deact.ok && deact.needsConfirmation?.companies === 1, "deactivating a plan companies are on needs the count");
  ok(!(await setPlanActive("pro", false, "admin-1", { confirmCompanies: 5 })).ok, "stale count refused");
  ok((await setPlanActive("pro", false, "admin-1", { confirmCompanies: 1 })).ok, "confirmed deactivate");
  eq((await getPlan("pro"))!.active, false, "inactive");
  eq((await getCompanySubscription(company))?.planId, "pro", "company keeps the plan");
  eq(await auditCount("plan.deactivate"), 1, "deactivate audited");
  ok(!(await setDefaultPlan("pro", "admin-1")).ok, "inactive plan can't be default");
  ok((await setPlanActive("pro", true, "admin-1")).ok, "reactivate");
  ok(!(await deletePlan("pro", "admin-1")).ok, "can't delete a plan companies are on");
  ok(!(await setPlanActive("free", false, "admin-1")).ok, "default can't be deactivated");
  ok(!(await deletePlan("free", "admin-1")).ok, "default can't be deleted");
  ok((await setDefaultPlan("starter", "admin-1")).ok, "set default");
  eq((await getDefaultPlan())?._id, "starter", "default moved");
  eq((await listPlans()).filter((p) => p.isDefault).length, 1, "exactly one default");
  eq(await auditCount("plan.set_default"), 1, "set default audited");
  const unDefault = await savePlan(base({ _id: "starter", name: "Starter", isDefault: false }), "update", "admin-1");
  ok(!unDefault.ok && unDefault.fieldErrors?.isDefault, "can't un-default via edit");

  await savePlan(base({ _id: "temp", name: "Temp" }), "create", "admin-1");
  await events.insertOne({ _id: "e1" as never, companyId: "x", type: "trial_started", planId: "legacy", interval: "monthly", mrr: 0, at: t0 });
  ok(!(await deletePlan("legacy", "admin-1")).ok, "plan with history can't be deleted");
  ok((await deletePlan("temp", "admin-1")).ok, "unused plan deleted");
  eq(await getPlan("temp"), null, "gone");
  eq(await auditCount("plan.delete"), 1, "delete audited");

  // ---- reorder
  ok((await movePlan("pro", "up", "admin-1")).ok, "move up");
  eq((await listPlans()).map((p) => p._id), ["free", "starter", "growth", "business", "pro", "enterprise", "legacy"], "pro moved above enterprise");
  ok((await movePlan("free", "up", "admin-1")).ok, "moving the first up is a no-op");
  eq((await listPlans())[0]._id, "free", "still first");
  eq(await auditCount("plan.reorder"), 1, "reorder audited");

  // ---- trials: start, settings-driven length, events
  let settings = await getBillingSettings();
  await saveBillingSettings({ ...settings, seller: { ...settings.seller, legalName: "Owner Pvt Ltd", tradeName: "Orbit", stateCode: "33" }, billing: { ...settings.billing, defaultTrialDays: 10, graceDays: 3, trialReminderDays: [7, 3, 1] } }, "test");
  settings = await getBillingSettings();
  const trialCo = randomUUID();
  await db.collection("companies").insertOne({ _id: trialCo as never, slug: "trialco", name: "TrialCo", status: "active", isPlatformOwner: false, createdAt: t0, updatedAt: t0 });
  await db.collection("admin_users").insertOne({ _id: randomUUID() as never, companyId: trialCo, email: "o@trialco.test", roles: ["super_admin"], createdAt: t0 });
  const sub = await startTrial(trialCo, "pro");
  eq(trialDaysLeft(sub.trialEndsAt!, new Date()), 10, "blank plan trial → platform default (10)");
  eq(await events.countDocuments({ companyId: trialCo, type: "trial_started" }), 1, "trial_started recorded");

  // legacy company without a subscription, created 20 days ago → persisted, then expired past grace.
  const legacyCo = randomUUID();
  await db.collection("companies").insertOne({ _id: legacyCo as never, slug: "oldco", name: "OldCo", status: "active", isPlatformOwner: false, createdAt: new Date(Date.now() - 40 * DAY), updatedAt: t0 });

  // Sweep at day 4 left → the 7-day reminder.
  const endsAt = sub.trialEndsAt!.getTime();
  let r = await runTrialSweep(new Date(endsAt - 4 * DAY));
  eq(r.reminders[7], 1, "7-day reminder sent");
  eq(r.legacyTrialsStarted, 1, "legacy trial persisted");
  r = await runTrialSweep(new Date(endsAt - 4 * DAY));
  eq(r.reminders[7], 0, "re-run doesn't re-send");
  // Missed runs: jump to 1 day left → only the 1-day reminder, 3 marked covered.
  r = await runTrialSweep(new Date(endsAt - 0.5 * DAY));
  eq([r.reminders[3], r.reminders[1]], [0, 1], "only the most urgent due reminder");
  eq((await getCompanySubscription(trialCo))?.trialRemindersSent?.sort(), [1, 3, 7], "all thresholds recorded");

  // Expiry → grace (3 days).
  r = await runTrialSweep(new Date(endsAt + DAY));
  eq(r.toGrace, 1, "trial → grace");
  let s = (await getCompanySubscription(trialCo))!;
  eq(s.status, "grace", "grace persisted");
  eq(s.graceEndsAt?.getTime(), endsAt + 3 * DAY, "grace = trial end + graceDays");
  eq(await events.countDocuments({ companyId: trialCo, type: "grace" }), 1, "grace event");
  eq(await auditCount("subscription.trial_expired"), 2, "trial expiry audited (trialco + legacy)");
  eq((await getCompanySubscription(legacyCo))?.status, "suspended", "legacy trial long over → suspended directly");
  eq(await events.countDocuments({ companyId: legacyCo, type: "suspended" }), 1, "legacy suspended event");
  const ent = await runAsCompany(trialCo, () => getEntitlements());
  eq([ent.status, ent.readOnly], ["grace", false], "grace is still usable");

  // Grace over → suspended.
  r = await runTrialSweep(new Date(endsAt + 4 * DAY));
  eq(r.suspended, 1, "grace → suspended");
  eq((await getCompanySubscription(trialCo))?.status, "suspended", "suspended persisted");
  eq(await events.countDocuments({ companyId: trialCo, type: "suspended" }), 1, "suspended event");
  r = await runTrialSweep(new Date(endsAt + 5 * DAY));
  eq(r.suspended + r.toGrace, 0, "idempotent");

  // ---- extend trial
  ok(!(await extendTrial(trialCo, 0, "admin-1")).ok, "days validated");
  ok(!(await extendTrial(company, 5, "admin-1")).ok, "paying company can't be extended");
  const ext = await extendTrial(trialCo, 5, "admin-1");
  ok(ext.ok, "extend suspended trial");
  s = (await getCompanySubscription(trialCo))!;
  eq([s.status, s.graceEndsAt, s.trialRemindersSent], ["trialing", null, []], "back on trial, reminders reset");
  eq(trialDaysLeft(s.trialEndsAt!, new Date()), 5, "5 days from now");
  eq(await auditCount("company.trial.extend"), 1, "extend audited");
  eq(await events.countDocuments({ companyId: trialCo, type: "trial_started" }), 2, "restart recorded as trial_started");
  const ext2 = await extendTrial(trialCo, 2, "admin-1");
  ok(ext2.ok && trialDaysLeft(ext2.trialEndsAt, new Date()) === 7, "extending a live trial adds to its end");
  eq(await events.countDocuments({ companyId: trialCo, type: "trial_started" }), 2, "no event when already trialing");
  const ov = await getTrialOverview(trialCo);
  eq([ov?.status, ov?.daysLeft, ov?.canExtend, ov?.planName], ["trialing", 7, true, "Pro+"], "overview");

  // ---- form round-trip
  const back = parsePlanForm(planToFormValues((await getPlan("pro"))!));
  eq(back.errors, {}, "edit form round-trips");
  eq(back.input.intervals, ["monthly"], "cycles round-trip");
  eq(back.input.limits.projects, 50, "custom limits round-trip");

  console.log(`plans & trials: all ${checks} checks passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await clientPromise;
    if (/test/.test(c.db().databaseName)) await c.db().dropDatabase();
    await c.close();
  });
