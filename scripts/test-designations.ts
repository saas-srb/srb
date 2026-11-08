/**
 * The built-in designations: every role they use is a real role, none is the Director role, titles and keys are unique.
 *   npx tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-designations.ts
 */
import assert from "node:assert/strict";
import { DESIGNATION_TEMPLATES, DIRECTOR_ROLE } from "../src/lib/platform/designations";
import { ALL_KNOWN_ROLES } from "../src/lib/products/commandos/role-catalog";

let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const known = new Set(ALL_KNOWN_ROLES);

t("every role of every designation is a real product role", () => {
  for (const d of DESIGNATION_TEMPLATES) for (const r of d.roles) assert.ok(known.has(r), `${d.title}: unknown role ${r}`);
});
t("no designation carries the Director role (it is separate)", () => {
  for (const d of DESIGNATION_TEMPLATES) assert.ok(!d.roles.includes(DIRECTOR_ROLE), d.title);
});
t("keys and titles are unique", () => {
  assert.equal(new Set(DESIGNATION_TEMPLATES.map((d) => d.key)).size, DESIGNATION_TEMPLATES.length);
  assert.equal(new Set(DESIGNATION_TEMPLATES.map((d) => d.title.toLowerCase())).size, DESIGNATION_TEMPLATES.length);
  assert.ok(!DESIGNATION_TEMPLATES.some((d) => d.title.toLowerCase() === "director"));
});
t("titles fit the custom-role name rule and there are no duplicate roles inside one", () => {
  for (const d of DESIGNATION_TEMPLATES) {
    assert.ok(d.title.length >= 2 && d.title.length <= 40, d.title);
    assert.equal(new Set(d.roles).size, d.roles.length, d.title);
    assert.ok(d.roles.length > 0, d.title);
  }
});
console.log(`\n${passed} checks passed (${DESIGNATION_TEMPLATES.length} designations).`);
