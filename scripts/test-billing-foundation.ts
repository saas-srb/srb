/**
 * Billing foundation checks (plans seed, trial, entitlements, usage) against
 * a throwaway database that is dropped at the end.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/billing_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-billing-foundation.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { listPlans, getDefaultPlan } from "@/lib/platform/billing/plans";
import { startTrial, updateCompanySubscription, getCompanySubscription } from "@/lib/platform/billing/subscription";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { recordUsage, getUsage } from "@/lib/platform/billing/usage";
import { getBillingSettings, saveBillingSettings } from "@/lib/platform/billing/settings";

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  const now = new Date();
  const owner = randomUUID();
  const a = randomUUID();
  const b = randomUUID();
  await db.collection("companies").insertMany([
    { _id: owner as never, slug: "owner", name: "Owner", status: "active", isPlatformOwner: true, createdAt: now, updatedAt: now },
    { _id: a as never, slug: "alpha", name: "Alpha", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now },
    { _id: b as never, slug: "beta", name: "Beta", status: "active", isPlatformOwner: false, createdAt: new Date(now.getTime() - 30 * 86_400_000), updatedAt: now },
  ]);

  const plans = await listPlans();
  assert.deepEqual(plans.map((p) => p._id), ["free", "starter", "growth", "business", "enterprise"], "default plans seeded in order");
  assert.equal((await getDefaultPlan())?._id, "free");
  assert.deepEqual(plans.map((p) => p.priceMonthly), [0, 49_900, 99_900, 199_900, 0], "decided monthly prices (paise)");
  assert.ok(plans.every((p) => p.trialDays === 0), "no trial: Free is the start");
  // The rest checks trials and product sets, which the real catalogue does not have (every plan has every product; Free is the start), so this
  // test database gets an older-style catalogue: Growth is the default, with a 30-day trial and without Social Media.
  const col = (await getPlatformDb()).collection("billing_plans");
  await col.updateMany({}, { $set: { trialDays: 30, isDefault: false } });
  await col.updateOne({ _id: "growth" as never }, { $set: { isDefault: true, modules: ["hrms", "pms", "lms", "fms", "prms", "sop", "lpms", "dlms", "cms", "seo", "portal", "ots", "intelligence"] } });
  const settings = await getBillingSettings();
  assert.equal(settings.billing.defaultTrialDays, 30);
  assert.equal(settings.tax.gstRatePercent, 18);
  const bad = await saveBillingSettings({ ...settings, seller: { ...settings.seller, legalName: "Owner Pvt Ltd", gstin: "NOT-A-GSTIN" } }, "test");
  assert.ok(!bad.ok && "seller.gstin" in bad.errors, "invalid GSTIN rejected");
  const good = await saveBillingSettings({ ...settings, seller: { ...settings.seller, legalName: "Owner Pvt Ltd", gstin: "33ABCDE1234F1Z7" }, billing: { ...settings.billing, defaultTrialDays: 45 } }, "test");
  assert.ok(good.ok);
  const saved = await getBillingSettings();
  assert.equal(saved.seller.stateCode, "33", "state derived from GSTIN");
  assert.equal(saved.billing.defaultTrialDays, 45);

  const e0 = await runAsCompany(owner, () => getEntitlements());
  assert.equal(e0.status, "internal");
  assert.equal(e0.modules, null);
  assert.equal(e0.readOnly, false);

  await startTrial(a);
  const ea = await runAsCompany(a, () => getEntitlements());
  assert.equal(ea.status, "trialing");
  assert.equal(ea.trialDaysLeft, 30);
  assert.ok(ea.modules?.has("hrms") && ea.modules.has("messenger") && !ea.modules.has("smms"), "growth products + core, not smms");
  assert.equal(ea.limits.seats, 50);

  // No stored subscription + created 30 days ago → implicit trial just ended → grace (platform
  // grace days, still usable), then suspended once grace runs out (see test-plans-trials.ts).
  const eb = await runAsCompany(b, () => getEntitlements());
  assert.equal(eb.status, "grace");
  assert.equal(eb.readOnly, false);

  await updateCompanySubscription(a, { planId: "business", status: "active" });
  const ea2 = await runAsCompany(a, () => getEntitlements());
  assert.equal(ea2.modules, null, "business = all products");
  assert.equal((await getCompanySubscription(owner))?.status, "internal", "owner can't be given a subscription");
  await updateCompanySubscription(owner, { status: "suspended" });
  assert.equal((await getCompanySubscription(owner))?.status, "internal");

  await runAsCompany(a, () => recordUsage("ai_tokens", 1200));
  await runAsCompany(a, () => recordUsage("ai_tokens", 300));
  await runAsCompany(b, () => recordUsage("ai_tokens", 5));
  assert.equal(await runAsCompany(a, () => getUsage("ai_tokens")), 1500);
  assert.equal(await runAsCompany(b, () => getUsage("ai_tokens")), 5, "usage is per company");
  console.log("billing foundation: all checks passed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await clientPromise;
    await c.db().dropDatabase();
    await c.close();
  });
