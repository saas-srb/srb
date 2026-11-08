/**
 * 30-day email verification rule (pure).
 *   npx tsx scripts/test-email-lapse.ts
 */
import assert from "node:assert/strict";
import { LAPSE_OPEN_PATH, isEmailLapsed, verifyDaysLeft, verifyDeadline } from "../src/lib/platform/email-lapse-rule";

let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const d = (s: string) => new Date(s);

t("new company: 30 days from registration", () => {
  assert.equal(verifyDeadline(d("2026-11-01T10:00:00Z")).toISOString(), "2026-12-01T10:00:00.000Z");
});
t("old company: 30 days from the rule start, not from its old registration", () => {
  assert.equal(verifyDeadline(d("2025-01-01T00:00:00Z")).toISOString(), "2026-11-24T00:00:00.000Z");
});
t("days left rounds up and floors at 0", () => {
  assert.equal(verifyDaysLeft(d("2026-11-01T10:00:00Z"), d("2026-11-01T10:00:00Z")), 30);
  assert.equal(verifyDaysLeft(d("2026-11-01T10:00:00Z"), d("2026-11-30T12:00:00Z")), 1);
  assert.equal(verifyDaysLeft(d("2026-11-01T10:00:00Z"), d("2027-02-01T00:00:00Z")), 0);
});
t("lapsed only when unverified, past due and not exempt", () => {
  const c = d("2026-11-01T10:00:00Z");
  const base = { createdAt: c, verified: false, exempt: false };
  assert.equal(isEmailLapsed({ ...base, now: d("2026-11-30T00:00:00Z") }), false);
  assert.equal(isEmailLapsed({ ...base, now: d("2026-12-01T10:00:00Z") }), true);
  assert.equal(isEmailLapsed({ ...base, now: d("2027-03-01T00:00:00Z"), verified: true }), false);
  assert.equal(isEmailLapsed({ ...base, now: d("2027-03-01T00:00:00Z"), exempt: true }), false);
});
t("open paths", () => {
  for (const p of ["/commandos/verify-required", "/commandos/verify-email/confirm", "/commandos/login", "/api/secure/action", "/api/account/session"]) assert.ok(LAPSE_OPEN_PATH.test(p), p);
  for (const p of ["/commandos", "/talentos", "/api/talentos/employees", "/commandos/users"]) assert.ok(!LAPSE_OPEN_PATH.test(p), p);
});
console.log(`${passed} passed`);
