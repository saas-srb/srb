/**
 * No moving down a plan (pure).
 *   npx tsx scripts/test-plan-order.ts
 */
import assert from "node:assert/strict";
import { downgradeGuarded, isPlanDowngrade } from "../src/lib/platform/billing/plan-order-rule";

let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };

t("lower price = downgrade", () => {
  assert.equal(isPlanDowngrade(199_900, 99_900), true); // Business -> Growth
  assert.equal(isPlanDowngrade(99_900, 49_900), true);
  assert.equal(isPlanDowngrade(49_900, 0), true); // Starter -> Free
});
t("same or higher is fine", () => {
  assert.equal(isPlanDowngrade(99_900, 99_900), false);
  assert.equal(isPlanDowngrade(49_900, 199_900), false);
  assert.equal(isPlanDowngrade(0, 49_900), false);
  assert.equal(isPlanDowngrade(0, 0), false);
});
t("a contact-us plan counts as the highest", () => {
  assert.equal(isPlanDowngrade(199_900, null), false);
  assert.equal(isPlanDowngrade(null, 199_900), true);
  assert.equal(isPlanDowngrade(null, null), false);
});
t("only a company that currently has a running plan is guarded", () => {
  for (const s of ["trialing", "active", "past_due", "grace"]) assert.equal(downgradeGuarded(s), true, s);
  for (const s of ["suspended", "canceled", "internal"]) assert.equal(downgradeGuarded(s), false, s);
});
console.log(`${passed} passed`);
