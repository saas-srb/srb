/**
 * Plan chosen on the pricing page → sign-up (pure rules).
 *   npx tsx scripts/test-signup-plan.ts
 */
import assert from "node:assert/strict";
import { SIGNUP_TRIAL_FALLBACK_DAYS, parseSignupInterval, signupPlanHref, signupTrialDays, trialLabel } from "../src/lib/platform/billing/signup-plan-rule";

let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };

t("trial length: plan days win, else the platform default, else one month", () => {
  assert.equal(signupTrialDays(14, 30), 14);
  assert.equal(signupTrialDays(0, 30), 30); // seeded paid plans have 0: the platform default (one month) applies
  assert.equal(signupTrialDays(null, 21), 21);
  assert.equal(signupTrialDays(0, 0), SIGNUP_TRIAL_FALLBACK_DAYS);
  assert.equal(signupTrialDays(undefined, -5), SIGNUP_TRIAL_FALLBACK_DAYS);
});
t("interval parsing accepts only the two cycles", () => {
  assert.equal(parseSignupInterval("yearly"), "yearly");
  assert.equal(parseSignupInterval("monthly"), "monthly");
  assert.equal(parseSignupInterval("weekly"), null);
  assert.equal(parseSignupInterval(undefined), null);
});
t("sign-up link carries the plan and cycle, encoded", () => {
  assert.equal(signupPlanHref("starter", "yearly"), "/signup?plan=starter&interval=yearly");
  assert.equal(signupPlanHref("a b&c", "monthly"), "/signup?plan=a%20b%26c&interval=monthly");
});
t("trial wording", () => {
  assert.equal(trialLabel(30), "1 month");
  assert.equal(trialLabel(60), "2 months");
  assert.equal(trialLabel(14), "2 weeks");
  assert.equal(trialLabel(10), "10 days");
});
console.log(`${passed} passed`);
