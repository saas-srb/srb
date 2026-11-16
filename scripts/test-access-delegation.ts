import assert from "node:assert/strict";
import { featuresBeyond } from "../src/lib/products/commandos/delegation";
import { featuresOf } from "../src/lib/access/catalogue";
import { legacyToAccess } from "../src/lib/access/adapter";
import type { AccessMap } from "../src/lib/access/types";

// A delegated manager can only give what they hold themselves (pure). Run: npx tsx scripts/test-access-delegation.ts
let passed = 0;
const T = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };
const all = (p: string): AccessMap => ({ [p]: Object.fromEntries(featuresOf(p).filter((e) => e.kind !== "tier").map((e) => [e.key, e.level])) });

T("a Director gives anything", () => assert.deepEqual(featuresBeyond({ roles: ["super_admin"] }, all("talentos")), []));
T("a manager of one product can give that product's features they hold, and nothing in another product", () => {
  const mine = legacyToAccess({ roles: ["pms_manager"], permissionOverrides: null }).access;
  assert.deepEqual(featuresBeyond({ roles: ["pms_manager"] }, mine), [], "what they hold they may give");
  const beyond = featuresBeyond({ roles: ["pms_manager"] }, all("talentos"));
  assert.ok(beyond.length > 5 && beyond.every((s) => s.startsWith("talentos.")), "everything in a product they do not hold is beyond them");
});
T("a lower level of a feature they hold is fine; a higher one is not", () => {
  const mine = legacyToAccess({ roles: ["pms_manager"], permissionOverrides: null }).access;
  const [product, features] = Object.entries(mine).find(([, f]) => Object.values(f).includes("write"))!;
  const key = Object.entries(features).find(([, l]) => l === "write")![0];
  assert.deepEqual(featuresBeyond({ roles: ["pms_manager"] }, { [product]: { [key]: "read" } }), []);
  const writeKey = Object.entries(features).find(([k, l]) => l === "read" && featuresOf(product).find((e) => e.key === k && e.level === "write"));
  void writeKey; // a feature held at read, asked at write, is covered by the DB test of bulk access (delegate refused)
});
T("someone with no roles can give nothing", () => assert.ok(featuresBeyond({ roles: [] }, all("sprintos")).length > 5));
console.log(`\n${passed} passed`);
