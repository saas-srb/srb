import assert from "node:assert/strict";
import { scopeFor, scopeFilter, inScope } from "../src/lib/access/scope";
import { featuresOf } from "../src/lib/access/catalogue";

// scopeFor / scopeFilter / inScope (pure). Run: npx tsx scripts/test-access-scope.ts
let passed = 0;
const T = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };
const [a, b] = featuresOf("talentos").filter((e) => e.kind !== "tier");
const F = { product: "talentos", all: a.key, own: b.key };

T("a Director is always 'all'; a person with the everyone's feature is 'all'; with only the own feature 'own'; with neither 'none'", () => {
  assert.equal(scopeFor({ isDirector: true }, F), "all");
  assert.equal(scopeFor({ access: { talentos: { [a.key]: "read" } } }, F), "all");
  assert.equal(scopeFor({ access: { talentos: { [b.key]: "read" } } }, F), "own");
  assert.equal(scopeFor({ access: { talentos: {} } }, F), "none");
  assert.equal(scopeFor(null, F), "none");
  assert.equal(scopeFor({ access: { sprintos: { [a.key]: "write" } } }, F), "none", "another product's feature does not count");
});
T("a write needs the Write level in that scope: read-only everyone's access is not write-all, and own-write is not all", () => {
  const readAll = { access: { talentos: { [a.key]: "read" as const } } };
  assert.equal(scopeFor(readAll, F, "write"), "none");
  const ownWrite = { access: { talentos: { [b.key]: "write" as const } } };
  assert.equal(scopeFor(ownWrite, F, "write"), "own");
  assert.equal(scopeFor(ownWrite, F, "read"), "own");
});
T("with no own-only variant the feature is all or nothing", () => {
  assert.equal(scopeFor({ access: { talentos: { [b.key]: "read" } } }, { product: "talentos", all: a.key }), "none");
});
T("the filter confines the query: everything, only my records, or no query at all", () => {
  assert.deepEqual(scopeFilter("all", "employeeId", "e1"), {});
  assert.deepEqual(scopeFilter("own", "employeeId", "e1"), { employeeId: "e1" });
  assert.equal(scopeFilter("own", "employeeId", null), null, "own without an identity sees nothing");
  assert.equal(scopeFilter("none", "employeeId", "e1"), null);
});
T("a single record: all sees any, own only theirs, none nothing", () => {
  assert.equal(inScope("all", "x", "e1"), true);
  assert.equal(inScope("own", "e1", "e1"), true);
  assert.equal(inScope("own", "e2", "e1"), false);
  assert.equal(inScope("own", "e1", null), false);
  assert.equal(inScope("none", "e1", "e1"), false);
});
console.log(`\n${passed} passed`);
