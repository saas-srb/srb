/**
 * The plan the Upgrade strip offers (pure).
 *   npx tsx scripts/test-upgrade-offer.ts
 */
import assert from "node:assert/strict";
import { nextPlanIn, type PlanStep } from "../src/lib/platform/billing/upgrade-offer-rule";

let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const P = (id: string, monthly: number | null, active = true): PlanStep => ({ id, name: id[0].toUpperCase() + id.slice(1), monthly, currency: "INR", active });
const plans = [P("free", 0), P("starter", 49_900), P("growth", 99_900), P("business", 199_900), P("enterprise", null)];

t("one step up, in order", () => {
  assert.equal(nextPlanIn(plans, "free")?.toId, "starter");
  assert.equal(nextPlanIn(plans, "starter")?.toId, "growth");
  assert.equal(nextPlanIn(plans, "growth")?.toId, "business");
});
t("nothing above the top plan sold online", () => {
  assert.equal(nextPlanIn(plans, "business"), null);
  assert.equal(nextPlanIn(plans, "enterprise"), null);
});
t("order follows price, not list order", () => {
  const shuffled = [P("business", 199_900), P("free", 0), P("growth", 99_900), P("starter", 49_900)];
  assert.equal(nextPlanIn(shuffled, "starter")?.toId, "growth");
});
t("a plan switched off is skipped", () => {
  assert.equal(nextPlanIn([P("free", 0), P("starter", 49_900, false), P("growth", 99_900)], "free")?.toId, "growth");
});
t("an unknown current plan is offered the first paid plan", () => {
  assert.equal(nextPlanIn(plans, "trial")?.toId, "starter");
});
t("the offer carries the price and the from-name", () => {
  const o = nextPlanIn(plans, "starter")!;
  assert.deepEqual([o.fromName, o.toName, o.monthly, o.currency], ["Starter", "Growth", 99_900, "INR"]);
});
console.log(`${passed} passed`);
