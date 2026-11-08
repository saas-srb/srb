/**
 * Top-up packs and how credits are spent (pure).
 *   npx tsx scripts/test-topups.ts
 */
import assert from "node:assert/strict";
import { TOPUP_PACKS, allocateBurn, formatUnits, overflowOf, packById, packExpiry, packsFor } from "../src/lib/platform/billing/topup-catalog";

let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const d = (s: string) => new Date(s);

t("every service has packs, ids are unique, bigger packs cost more but less per unit", () => {
  assert.equal(new Set(TOPUP_PACKS.map((p) => p.id)).size, TOPUP_PACKS.length);
  for (const s of ["ai_tokens", "emails", "voice_minutes", "domains"] as const) {
    const ps = packsFor(s).sort((a, b) => a.units - b.units);
    assert.ok(ps.length >= 3, s);
    for (let i = 1; i < ps.length; i++) {
      assert.ok(ps[i].price > ps[i - 1].price, `${s} price rises`);
      assert.ok(ps[i].price / ps[i].units < ps[i - 1].price / ps[i - 1].units, `${s} gets cheaper per unit`);
    }
    assert.equal(ps.filter((p) => p.popular).length, 1, `${s} has one popular pack`);
  }
});
t("lookup is by exact id only", () => {
  assert.equal(packById("ai_2m")?.units, 2_000_000);
  assert.equal(packById("AI_2M"), null);
  assert.equal(packById(undefined), null);
  assert.equal(packById({ id: "ai_2m" }), null);
});
t("wording", () => {
  assert.equal(formatUnits("ai_tokens", 500_000), "500K AI tokens");
  assert.equal(formatUnits("ai_tokens", 2_000_000), "2M AI tokens");
  assert.equal(formatUnits("emails", 5000), "5,000 emails");
  assert.equal(formatUnits("voice_minutes", 100), "100 voice minutes");
  assert.equal(formatUnits("domains", 1), "1 custom domain");
  assert.equal(formatUnits("domains", 3), "3 custom domains");
});
t("a pack lapses 12 months later", () => {
  assert.equal(packExpiry(d("2026-10-25T10:00:00Z")).toISOString(), "2027-10-25T10:00:00.000Z");
});
t("only the part of a use beyond the plan allowance is taken from credits", () => {
  assert.equal(overflowOf(900, 950, 1000), 0); // still inside the plan
  assert.equal(overflowOf(990, 1030, 1000), 30); // crosses the line: 30 over
  assert.equal(overflowOf(1100, 1150, 1000), 50); // all beyond it
  assert.equal(overflowOf(500, 500, 1000), 0);
  assert.equal(overflowOf(1200, 1100, 1000), 0); // usage can't go down here
});
t("credits are spent soonest-expiring first, never expired ones, and shortfalls are reported", () => {
  const now = d("2026-11-01T00:00:00Z");
  const packs = [
    { id: "late", remaining: 100, expiresAt: d("2027-06-01T00:00:00Z") },
    { id: "soon", remaining: 40, expiresAt: d("2026-12-01T00:00:00Z") },
    { id: "gone", remaining: 999, expiresAt: d("2026-10-01T00:00:00Z") },
    { id: "empty", remaining: 0, expiresAt: d("2026-11-15T00:00:00Z") },
  ];
  assert.deepEqual(allocateBurn(packs, 60, now), { takes: [{ id: "soon", take: 40 }, { id: "late", take: 20 }], short: 0 });
  assert.deepEqual(allocateBurn(packs, 500, now), { takes: [{ id: "soon", take: 40 }, { id: "late", take: 100 }], short: 360 });
  assert.deepEqual(allocateBurn(packs, 0, now), { takes: [], short: 0 });
});
console.log(`${passed} passed`);
