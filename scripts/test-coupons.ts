/**
 * Coupon checks (validation rules, race-safe redemption, quote
 * math) against a throwaway database that is dropped at the end.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/coupons_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-coupons.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { listPlans } from "@/lib/platform/billing/plans";
import { updateCompanySubscription } from "@/lib/platform/billing/subscription";
import {
  computeCouponDiscount,
  getCoupon,
  getRenewalRedemption,
  listCouponRedemptions,
  markRedemptionCycleBilled,
  redeemCoupon,
  releaseRedemption,
  saveCoupon,
  setCouponActive,
  validateCoupon,
  type CouponInput,
} from "@/lib/platform/billing/coupons";
import { quoteCheckout } from "@/lib/platform/billing/quote";

let checks = 0;
function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  checks++;
}
function eq<T>(a: T, b: T, msg: string) {
  assert.deepEqual(a, b, msg);
  checks++;
}

const base: CouponInput = {
  code: "",
  description: "",
  kind: "percent",
  percentOff: 20,
  amountOff: null,
  plans: "all",
  intervals: ["monthly", "yearly"],
  duration: "once",
  durationCycles: null,
  validFrom: null,
  validUntil: null,
  maxRedemptions: null,
  maxPerCompany: 1,
  firstTimeOnly: false,
  active: true,
};
async function coupon(patch: Partial<CouponInput>): Promise<string> {
  const r = await saveCoupon(null, { ...base, ...patch }, "tester");
  if (!r.ok) throw new Error(`coupon ${patch.code}: ${JSON.stringify(r.errors)}`);
  return r.id;
}

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  const now = new Date();
  const owner = randomUUID();
  const companies = Array.from({ length: 6 }, () => randomUUID());
  const [a, b, c, d, e, f] = companies;
  await db.collection("companies").insertMany([
    { _id: owner as never, slug: "owner", name: "Owner", status: "active", isPlatformOwner: true, createdAt: now, updatedAt: now },
    ...companies.map((id, i) => ({ _id: id as never, slug: `co${i}`, name: `Company ${i}`, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now })),
  ]);
  await listPlans(); // seed the catalogue
  // These checks were written for a ₹1,999 Growth plan; this test database's Growth gets that price (the real one is ₹999).
  await db.collection("billing_plans").updateOne({ _id: "free" as never }, { $unset: { trialDays: "" } }); // the checks need the implicit trial of a company with no subscription
  await db.collection("billing_plans").updateOne({ _id: "growth" as never }, { $set: { priceMonthly: 199_900, priceYearly: 1_999_000, "prices.monthly": 199_900, "prices.yearly": 1_999_000 } });

  // --- discount math -------------------------------------------------------
  eq(computeCouponDiscount({ kind: "percent", percentOff: 20, amountOff: null }, 199_900), 39_980, "20% of ₹1,999");
  eq(computeCouponDiscount({ kind: "percent", percentOff: 33.33, amountOff: null }, 99_900), 33_297, "33.33% rounds to nearest paisa (33296.67 → 33297)");
  eq(computeCouponDiscount({ kind: "percent", percentOff: 12.5, amountOff: null }, 101), 13, "half up (12.625 → 13)");
  eq(computeCouponDiscount({ kind: "fixed", percentOff: null, amountOff: 500_000 }, 199_900), 199_900, "fixed capped at subtotal");
  eq(computeCouponDiscount({ kind: "fixed", percentOff: null, amountOff: 50_000 }, 199_900), 50_000, "fixed below subtotal");

  // --- create validation -----------------------------------------------------
  const badCode = await saveCoupon(null, { ...base, code: "x" }, "tester");
  ok(!badCode.ok && "code" in badCode.errors, "short code rejected");
  const badPct = await saveCoupon(null, { ...base, code: "BAD1", percentOff: 150 }, "tester");
  ok(!badPct.ok && "percentOff" in badPct.errors, "percent > 100 rejected");
  const badPlan = await saveCoupon(null, { ...base, code: "BAD2", plans: ["nope"] }, "tester");
  ok(!badPlan.ok && "plans" in badPlan.errors, "unknown plan rejected");
  const badRange = await saveCoupon(null, { ...base, code: "BAD3", validFrom: "2030-01-02T00:00:00Z", validUntil: "2030-01-01T00:00:00Z" }, "tester");
  ok(!badRange.ok && "validUntil" in badRange.errors, "end before start rejected");
  const badRep = await saveCoupon(null, { ...base, code: "BAD4", duration: "repeating", durationCycles: null }, "tester");
  ok(!badRep.ok && "durationCycles" in badRep.errors, "repeating needs cycles");

  const welcome = await coupon({ code: "welcome20" });
  eq((await getCoupon(welcome))?.code, "WELCOME20", "code stored upper-case");
  const dup = await saveCoupon(null, { ...base, code: "Welcome20" }, "tester");
  ok(!dup.ok && /already exists/.test(dup.errors.code ?? ""), "case-insensitive unique code");

  // --- validation rules -------------------------------------------------------
  ok((await validateCoupon({ code: "wElCoMe20", companyId: a, planId: "growth", interval: "monthly" })).ok, "case-insensitive lookup");
  const unknown = await validateCoupon({ code: "NOPE", companyId: a, planId: "growth", interval: "monthly" });
  ok(!unknown.ok && /isn't valid/.test(unknown.error), "unknown code");
  await coupon({ code: "GROWTHONLY", plans: ["growth"] });
  const wrongPlan = await validateCoupon({ code: "growthonly", companyId: a, planId: "starter", interval: "monthly" });
  ok(!wrongPlan.ok && /Starter plan/.test(wrongPlan.error), "plan restriction");
  await coupon({ code: "YEARLYONLY", intervals: ["yearly"] });
  const wrongCycle = await validateCoupon({ code: "yearlyonly", companyId: a, planId: "growth", interval: "monthly" });
  ok(!wrongCycle.ok && /yearly/.test(wrongCycle.error), "interval restriction");
  ok((await validateCoupon({ code: "yearlyonly", companyId: a, planId: "growth", interval: "yearly" })).ok, "yearly allowed");
  await coupon({ code: "FUTURE", validFrom: new Date(Date.now() + 86_400_000) });
  const future = await validateCoupon({ code: "future", companyId: a, planId: "growth", interval: "monthly" });
  ok(!future.ok && /isn't active yet/.test(future.error), "not started");
  await coupon({ code: "EXPIRED", validFrom: new Date(Date.now() - 2 * 86_400_000), validUntil: new Date(Date.now() - 86_400_000) });
  const expired = await validateCoupon({ code: "expired", companyId: a, planId: "growth", interval: "monthly" });
  ok(!expired.ok && /expired/.test(expired.error), "expired");
  const inactiveId = await coupon({ code: "OFFNOW" });
  await setCouponActive(inactiveId, false, "tester");
  const inactive = await validateCoupon({ code: "offnow", companyId: a, planId: "growth", interval: "monthly" });
  ok(!inactive.ok && /no longer active/.test(inactive.error), "inactive");
  await coupon({ code: "FIRSTONLY", firstTimeOnly: true });
  ok((await validateCoupon({ code: "firstonly", companyId: a, planId: "growth", interval: "monthly" })).ok, "trialing company is first-time");
  await updateCompanySubscription(b, { planId: "growth", status: "active" });
  const notFirst = await validateCoupon({ code: "firstonly", companyId: b, planId: "growth", interval: "monthly" });
  ok(!notFirst.ok && /first-time/.test(notFirst.error), "paying company isn't first-time");
  await db.collection("subscription_events").insertOne({ _id: randomUUID() as never, companyId: c, type: "activated", planId: "growth", interval: "monthly", mrr: 1, at: now });
  await updateCompanySubscription(c, { status: "canceled" });
  ok(!(await validateCoupon({ code: "firstonly", companyId: c, planId: "growth", interval: "monthly" })).ok, "company that paid before (now canceled) isn't first-time");
  ok((await validateCoupon({ code: "firstonly", planId: "growth", interval: "monthly" })).ok, "anonymous preview skips company rules");

  // --- redemption: per company, idempotency, release ---------------------------
  const r1 = await redeemCoupon({ code: "welcome20", companyId: a, planId: "growth", interval: "monthly", discount: 39_980, reference: "order_1" });
  ok(r1.ok && !r1.alreadyRedeemed, "first redeem");
  const r1again = await redeemCoupon({ couponId: welcome, companyId: a, planId: "growth", interval: "monthly", discount: 39_980, reference: "order_1" });
  ok(r1again.ok && r1again.alreadyRedeemed && r1.ok && r1again.redemptionId === r1.redemptionId, "retry with same reference is idempotent");
  eq((await getCoupon(welcome))?.redeemedCount, 1, "idempotent retry didn't double count");
  const r1second = await redeemCoupon({ code: "welcome20", companyId: a, planId: "growth", interval: "monthly", discount: 1, reference: "order_2" });
  ok(!r1second.ok && /already used/.test(r1second.error), "max 1 per company");
  const perCo = await validateCoupon({ code: "welcome20", companyId: e, planId: "growth", interval: "monthly" });
  ok(perCo.ok && !perCo.continuing, "another company may still use it");
  // continuation: company a holds a live redemption with 1 cycle left → quote still applies it
  const cont = await validateCoupon({ code: "welcome20", companyId: a, planId: "growth", interval: "monthly" });
  ok(cont.ok && cont.continuing, "holder with cycles left is a continuation");
  ok(r1.ok && (await releaseRedemption({ redemptionId: r1.redemptionId, reason: "payment_failed" })), "release");
  ok(r1.ok && !(await releaseRedemption({ redemptionId: r1.redemptionId })), "second release is a no-op");
  eq((await getCoupon(welcome))?.redeemedCount, 0, "release gave the count back");
  const r1retry = await redeemCoupon({ code: "welcome20", companyId: a, planId: "growth", interval: "monthly", discount: 39_980, reference: "order_1" });
  ok(r1retry.ok && !r1retry.alreadyRedeemed, "after release the company can redeem again (same reference too)");
  const released = (await listCouponRedemptions(welcome)).filter((r) => r.status === "released");
  eq(released.length, 1, "released redemption kept for history");
  ok(await releaseRedemption({ reference: "order_1" }), "release by reference");

  // --- durations / renewals ------------------------------------------------------
  await coupon({ code: "THREEMONTHS", duration: "repeating", durationCycles: 3 });
  const r3 = await redeemCoupon({ code: "threemonths", companyId: d, planId: "growth", interval: "monthly", discount: 39_980, reference: "sub_d" });
  ok(r3.ok, "repeating redeem");
  if (r3.ok) {
    for (let i = 0; i < 2; i++) await markRedemptionCycleBilled(r3.redemptionId);
    eq((await getRenewalRedemption(d))?.code, "THREEMONTHS", "2 of 3 cycles billed → renewal still discounted");
    await setCouponActive((await getCoupon(r3.couponId))!._id, false, "tester");
    const q = await quoteCheckout({ planId: "growth", interval: "monthly", companyId: d, couponCode: "THREEMONTHS" });
    eq(q?.discount, 39_980, "continuation priced even after the coupon was deactivated");
    await markRedemptionCycleBilled(r3.redemptionId);
    eq(await getRenewalRedemption(d), null, "3 of 3 billed → no more discount");
  }

  // --- race: concurrent redeems against max total = 1 ---------------------------------
  const lastOne = await coupon({ code: "LASTONE", maxRedemptions: 1, maxPerCompany: null });
  const racers = [a, b, c, d, e, f, a, b, c, d, e, f];
  const results = await Promise.all(racers.map((co, i) => redeemCoupon({ code: "lastone", companyId: co, planId: "growth", interval: "monthly", discount: 1, reference: `race_${i}` })));
  eq(results.filter((r) => r.ok).length, 1, "exactly one concurrent redeem wins max=1");
  eq((await getCoupon(lastOne))?.redeemedCount, 1, "count never exceeds the limit");
  eq((await listCouponRedemptions(lastOne)).length, 1, "losers left no redemption rows");
  ok(results.filter((r) => !r.ok).every((r) => !r.ok && /redemption limit/.test(r.error)), "losers get the limit message");

  // race: same company, concurrent, max per company = 1 (no total limit)
  await coupon({ code: "ONEPERCO", maxPerCompany: 1 });
  const same = await Promise.all(Array.from({ length: 10 }, (_, i) => redeemCoupon({ code: "oneperco", companyId: f, planId: "growth", interval: "monthly", discount: 1, reference: `f_${i}` })));
  eq(same.filter((r) => r.ok).length, 1, "exactly one concurrent redeem per company wins max-per-company=1");

  // race: max 3 across 12 companies-ish
  const three = await coupon({ code: "THREE", maxRedemptions: 3, maxPerCompany: null });
  const r12 = await Promise.all(racers.map((co, i) => redeemCoupon({ code: "three", companyId: co, planId: "growth", interval: "monthly", discount: 1, reference: `t_${i}` })));
  eq(r12.filter((r) => r.ok).length, 3, "max=3 → exactly three winners");
  eq((await getCoupon(three))?.redeemedCount, 3, "count is 3");
  const cannotLower = await saveCoupon(three, { ...base, code: "THREE", maxRedemptions: 2, maxPerCompany: null }, "tester");
  ok(!cannotLower.ok && "maxRedemptions" in cannotLower.errors, "limit can't go below redemptions used");
  const raised = await saveCoupon(three, { ...base, code: "THREE", maxRedemptions: 5, maxPerCompany: null }, "tester");
  ok(raised.ok && (await getCoupon(three))?.maxRedemptions === 5 && (await getCoupon(three))?.redeemedCount === 3, "edit keeps the redeemed count");

  // quote with a coupon
  await coupon({ code: "TENPCT", percentOff: 10, maxPerCompany: null });
  const q2 = await quoteCheckout({ planId: "growth", interval: "monthly", couponCode: "tenpct", companyId: e });
  eq(q2?.discount, 19_990, "percent applies to the plan price");
  eq(q2?.taxable, 199_900 - 19_990, "taxable = subtotal − discount");
  eq(q2?.lines.at(-1)?.amount, -19_990, "negative discount line");
  ok(q2?.couponId && q2.couponError === null, "coupon id set");
  await coupon({ code: "BIGFIXED", kind: "fixed", percentOff: null, amountOff: 1_000_000, maxPerCompany: null });
  const q3 = await quoteCheckout({ planId: "growth", interval: "monthly", couponCode: "BIGFIXED" });
  eq([q3?.subtotal, q3?.discount, q3?.taxable], [199_900, 199_900, 0], "fixed discount capped at subtotal");
  const q4 = await quoteCheckout({ planId: "starter", interval: "monthly", couponCode: "growthonly" });
  ok(q4 && q4.discount === 0 && q4.couponId === null && /Starter plan/.test(q4.couponError ?? ""), "invalid coupon → couponError, no discount");
  eq(q4?.gstRatePercent, 18, "gst rate from settings");

  const audits = await db.collection("platform_audit_log").distinct("action");
  for (const act of ["coupon.create", "coupon.update", "coupon.deactivate", "coupon.redeem", "coupon.release"]) {
    ok(audits.includes(act), `audited: ${act}`);
  }
  console.log(`coupons: all ${checks} checks passed`);
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
