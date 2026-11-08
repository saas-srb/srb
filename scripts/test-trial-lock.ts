import assert from "node:assert/strict";
import { isTrialLocked, TRIAL_LOCK_OPEN_PATH } from "../src/lib/platform/billing/trial-lock-rule";

// Pure rule checks only: no database is read or written.
const now = new Date("2026-10-25T12:00:00Z");
const past = new Date("2026-10-20T00:00:00Z");
const future = new Date("2026-11-20T00:00:00Z");
const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };

t("ended trial, never paid = locked", () => assert.equal(isTrialLocked({ status: "trialing", trialEndsAt: past, currentPeriodStart: null }, now), true));
t("grace and suspended after an unpaid trial are locked too", () => {
  for (const status of ["grace", "suspended", "canceled"] as const) assert.equal(isTrialLocked({ status, trialEndsAt: past, currentPeriodStart: null }, now), true);
});
t("running trial = open", () => assert.equal(isTrialLocked({ status: "trialing", trialEndsAt: future, currentPeriodStart: null }, now), false));
t("subscribed = open", () => assert.equal(isTrialLocked({ status: "active", trialEndsAt: past, currentPeriodStart: past }, now), false));
t("has paid before = not locked (keeps read-only mode)", () => assert.equal(isTrialLocked({ status: "suspended", trialEndsAt: past, currentPeriodStart: past }, now), false));
t("platform owner, complimentary and no subscription are never locked", () => {
  assert.equal(isTrialLocked({ status: "internal", trialEndsAt: past, currentPeriodStart: null }, now), false);
  assert.equal(isTrialLocked({ status: "trialing", trialEndsAt: past, currentPeriodStart: null, complimentary: true }, now), false);
  assert.equal(isTrialLocked(null, now), false);
});
t("billing, usage and sign-in stay open; products do not", () => {
  for (const p of ["/commandos/settings/billing", "/commandos/settings/billing/invoices", "/commandos/settings/usage", "/commandos/subscribe-required", "/commandos/login", "/api/secure/x"]) assert.ok(TRIAL_LOCK_OPEN_PATH.test(p), p);
  for (const p of ["/commandos", "/commandos/settings", "/commandos/settings/billingx", "/talentos/employees", "/api/talentos/x"]) assert.ok(!TRIAL_LOCK_OPEN_PATH.test(p), p);
});
console.log("passed");
