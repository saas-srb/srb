/**
 * Per-company overrides of a plan: limits, capabilities, products.
 *   npx tsx scripts/test-company-overrides.ts
 */
import assert from "node:assert/strict";
import { applyFlagOverrides, applyLimitOverrides, applyModuleOverrides, checkOverridesInput, hasActiveOverrides } from "../src/lib/platform/billing/overrides";
import type { CompanyOverrides, PlanLimits } from "../src/lib/platform/billing/types";

let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const now = new Date("2026-10-25T12:00:00Z");
const future = new Date("2026-12-01T00:00:00Z");
const past = new Date("2026-09-01T00:00:00Z");
const plan: PlanLimits = { seats: 5, aiTokensPerMonth: 1_000_000, storageMb: 1024, emailsPerMonth: 500, voiceMinutesPerMonth: 0, customDomains: 1, apiCallsPerDay: 100 };
const known = { limitKeys: ["seats", "aiTokensPerMonth", "storageMb", "emailsPerMonth", "voiceMinutesPerMonth", "customDomains", "apiCallsPerDay"], flagKeys: ["customDomain", "whiteLabel", "apiAccess", "prioritySupport"], moduleKeys: ["hrms", "pms", "lms", "workspace", "messenger"], coreModules: ["workspace", "messenger"] };

t("no overrides changes nothing", () => assert.deepEqual(applyLimitOverrides(plan, null, now), plan));
t("set replaces the plan's limit (up or down)", () => {
  const o: CompanyOverrides = { limits: { seats: { mode: "set", value: 50 }, storageMb: { mode: "set", value: 10 } } };
  const r = applyLimitOverrides(plan, o, now);
  assert.equal(r.seats, 50); assert.equal(r.storageMb, 10); assert.equal(r.emailsPerMonth, 500);
});
t("add gives more than the plan", () => assert.equal(applyLimitOverrides(plan, { limits: { aiTokensPerMonth: { mode: "add", value: 500_000 } } }, now).aiTokensPerMonth, 1_500_000));
t("unlimited removes the limit; add to unlimited stays unlimited", () => {
  assert.equal(applyLimitOverrides(plan, { limits: { seats: { mode: "unlimited" } } }, now).seats, null);
  assert.equal(applyLimitOverrides({ ...plan, seats: null }, { limits: { seats: { mode: "add", value: 5 } } }, now).seats, null);
});
t("a limit the plan doesn't list can be given (custom limit)", () => assert.equal(applyLimitOverrides(plan, { limits: { newThing: { mode: "set", value: 7 } } }, now).newThing, 7));
t("voice minutes can be given to a plan without them", () => assert.equal(applyLimitOverrides(plan, { limits: { voiceMinutesPerMonth: { mode: "set", value: 300 } } }, now).voiceMinutesPerMonth, 300));
t("an override ends on its date", () => {
  const o: CompanyOverrides = { limits: { seats: { mode: "set", value: 50, until: future } } };
  assert.equal(applyLimitOverrides(plan, o, now).seats, 50);
  assert.equal(applyLimitOverrides(plan, { limits: { seats: { mode: "set", value: 50, until: past } } }, now).seats, 5);
  assert.equal(hasActiveOverrides(o, now), true);
  assert.equal(hasActiveOverrides({ limits: { seats: { mode: "set", value: 50, until: past } } }, now), false);
});
t("capabilities: on adds, off removes, a deleted plan stays unrestricted", () => {
  const o: CompanyOverrides = { flags: { whiteLabel: { on: true }, customDomain: { on: false } } };
  assert.deepEqual((applyFlagOverrides(["customDomain", "apiAccess"], o, now) ?? []).sort(), ["apiAccess", "whiteLabel"]);
  assert.equal(applyFlagOverrides(null, o, now), null);
  assert.deepEqual(applyFlagOverrides(["apiAccess"], { flags: { whiteLabel: { on: true, until: past } } }, now), ["apiAccess"]);
});
t("products: unlock adds, lock removes, core can't be locked, 'all' becomes 'all except'", () => {
  const all = known.moduleKeys, core = known.coreModules;
  const lim = new Set(["workspace", "messenger", "hrms"]);
  const unlocked = applyModuleOverrides(lim, { modules: { pms: { on: true } } }, now, all, core)!;
  assert.ok(unlocked.has("pms") && unlocked.has("hrms"));
  const locked = applyModuleOverrides(lim, { modules: { hrms: { on: false }, workspace: { on: false } } }, now, all, core)!;
  assert.ok(!locked.has("hrms") && locked.has("workspace"));
  const exceptLms = applyModuleOverrides(null, { modules: { lms: { on: false } } }, now, all, core)!;
  assert.ok(exceptLms !== null && !exceptLms.has("lms") && exceptLms.has("pms"));
  assert.equal(applyModuleOverrides(null, { modules: { lms: { on: false, until: past } } }, now, all, core), null);
  assert.equal(applyModuleOverrides(null, null, now, all, core), null);
});
t("input: valid changes are cleaned", () => {
  const r = checkOverridesInput({ limits: { seats: { mode: "set", value: "25" }, storageMb: { mode: "add", value: 2048, until: "2027-01-31" }, emailsPerMonth: { mode: "unlimited" }, aiTokensPerMonth: { mode: "plan" } }, flags: { apiAccess: { on: true } }, modules: { lms: { on: true } }, note: "  Pilot  " }, known, now);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(Object.keys(r.value.limits!).sort(), ["emailsPerMonth", "seats", "storageMb"]);
    assert.equal(r.value.limits!.seats.value, 25);
    assert.ok(r.value.limits!.storageMb.until instanceof Date);
    assert.equal(r.value.note, "Pilot");
  }
});
t("input: bad things are refused", () => {
  const bad = (i: Parameters<typeof checkOverridesInput>[0]) => assert.equal(checkOverridesInput(i, known, now).ok, false);
  bad({ limits: { nonsense: { mode: "set", value: 1 } } });
  bad({ limits: { seats: { mode: "set", value: -1 } } });
  bad({ limits: { seats: { mode: "set", value: 1.5 } } });
  bad({ limits: { seats: { mode: "set", value: "abc" } } });
  bad({ limits: { seats: { mode: "set" } } });
  bad({ limits: { seats: { mode: "set", value: 5, until: "2026-01-01" } } });
  bad({ limits: { seats: { mode: "set", value: 5, until: "tomorrow" } } });
  bad({ flags: { teleport: { on: true } } });
  bad({ modules: { workspace: { on: false } } });
  bad({ modules: { ghost: { on: true } } });
});
t("input: adding zero and 'plan default' are no change", () => {
  const r = checkOverridesInput({ limits: { seats: { mode: "add", value: 0 } } }, known, now);
  assert.ok(r.ok && !r.value.limits);
});
console.log(`\n${passed} checks passed.`);
