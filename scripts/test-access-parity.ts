import { isFinished } from "../src/lib/access/micro";
import assert from "node:assert/strict";
import { discover } from "./gen-access-catalogue";
import { CATALOGUE, FILE_ROLES, featuresOf, PRODUCTS, SELF_SERVICE } from "../src/lib/access/catalogue";
import { accessToLegacy, legacyToAccess, granted, completeAccess, baselineFeatures } from "../src/lib/access/adapter";
import { legacyAnswer, legacyAnswers, type LegacyUser } from "../src/lib/access/legacy";
import { can, requireAccess, normalizeAccess, AccessDeniedError } from "../src/lib/access/can";
import { describeAccess, isProductLocked } from "../src/lib/access/read-model";
import type { AccessMap } from "../src/lib/access/types";

// Pure: no database. Run with: npx tsx scripts/test-access-parity.ts
// PARITY HARNESS: for every role of every role file and every capability of the catalogue, the legacy answer must equal the answer
// the access model gives after the legacy user is converted to a matrix and back. Zero differences allowed.
let passed = 0;
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { passed++; console.log("  ✓", name); });
let checks = 0;

function diffs(a: Record<string, boolean>, b: Record<string, boolean>) {
  const out: string[] = [];
  for (const e of CATALOGUE) { checks++; if (a[e.key] !== b[e.key]) out.push(`${e.key}: legacy ${a[e.key]} vs adapter ${b[e.key]}`); }
  return out;
}

/** Full round trip for one legacy user. Returns every difference found. */
function roundTrip(user: LegacyUser): string[] {
  const legacy = legacyAnswers(user);
  const { isDirector, access } = legacyToAccess(user);
  if (isDirector) return CATALOGUE.filter((e) => !can({ isDirector: true, access }, e.product, e.key, e.level)).map((e) => `${e.key}: Director denied`);
  // (1) the matrix alone answers like the legacy code
  const fromMatrix: Record<string, boolean> = {};
  for (const e of CATALOGUE) fromMatrix[e.key] = can({ access }, e.product, e.key, e.level);
  const out = diffs(legacy, fromMatrix);
  // (2) the derived legacy user (what the unchanged products would see) answers like the legacy code
  const derived = accessToLegacy(access);
  for (const c of derived.conflicts) out.push(`conflict ${c.key}`);
  out.push(...diffs(legacy, legacyAnswers({ roles: derived.roles, permissionOverrides: derived.permissionOverrides })));
  return out;
}

(async () => {
console.log("catalogue");
await t("the generated catalogue is current (every capability of every role file, nothing stale)", async () => {
  const { entries, roles } = await discover();
  assert.equal(entries.length, CATALOGUE.length, "run: npx tsx scripts/gen-access-catalogue.ts --write");
  for (const e of entries) {
    const c = CATALOGUE.find((x) => x.key === e.key);
    assert.ok(c, `missing ${e.key}`);
    assert.deepEqual({ ...c }, { ...e }, `stale ${e.key}`);
  }
  assert.deepEqual(FILE_ROLES, roles);
});
await t("keys are unique and stable-shaped; override keys are unique", () => {
  assert.equal(new Set(CATALOGUE.map((e) => e.key)).size, CATALOGUE.length);
  for (const e of CATALOGUE) assert.match(e.key, /^[a-z]+\.[A-Za-z_]+$/);
  const ok = CATALOGUE.filter((e) => e.overrideKey).map((e) => e.overrideKey);
  assert.equal(new Set(ok).size, ok.length);
  assert.equal(CATALOGUE.length, 265);
  assert.equal(PRODUCTS.length, 17);
});

console.log("parity: every role of every role file");
const results: { file: string; role: string; diffs: string[] }[] = [];
for (const [file, roles] of Object.entries(FILE_ROLES)) {
  for (const role of roles) results.push({ file, role, diffs: roundTrip({ roles: [role], permissionOverrides: null }) });
}
await t(`${results.length} roles x ${CATALOGUE.length} capabilities: zero differences`, () => {
  const bad = results.filter((r) => r.diffs.length);
  assert.deepEqual(bad.map((r) => `${r.file}/${r.role}: ${r.diffs.slice(0, 3).join("; ")}`), []);
});
await t("the person with no roles can do nothing the legacy code would not allow", () => assert.deepEqual(roundTrip({ roles: [], permissionOverrides: null }), []));

console.log("parity: role combinations (every pair inside a product) and overrides");
let combos = 0;
await t("every pair of roles in a product", () => {
  const bad: string[] = [];
  for (const product of PRODUCTS) {
    const files = [...new Set(featuresOf(product).map((e) => e.source))];
    const roles = [...new Set(files.flatMap((f) => FILE_ROLES[f] ?? []))].filter((r) => r !== "super_admin");
    for (let i = 0; i < roles.length; i++) for (let j = i + 1; j < roles.length; j++) {
      combos++;
      const d = roundTrip({ roles: [roles[i], roles[j]], permissionOverrides: null });
      if (d.length) bad.push(`${roles[i]}+${roles[j]}: ${d[0]}`);
    }
  }
  assert.deepEqual(bad, []);
});
await t("every pair of any two roles from any two products (roles imply access across products)", () => {
  const all = [...new Set(Object.values(FILE_ROLES).flat())].filter((r) => r !== "super_admin").sort();
  const bad: string[] = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    combos++;
    const d = roundTrip({ roles: [all[i], all[j]], permissionOverrides: null });
    if (d.length) bad.push(`${all[i]}+${all[j]}: ${d[0]}`);
  }
  assert.deepEqual(bad, []);
});
await t("300 random real-looking people: 1 to 6 roles from any products plus random overrides", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const all = [...new Set(Object.values(FILE_ROLES).flat())].filter((r) => r !== "super_admin").sort();
  const keys = CATALOGUE.filter((e) => e.overrideKey).map((e) => e.overrideKey!);
  const bad: string[] = [];
  for (let n = 0; n < 300; n++) {
    const roles = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => all[Math.floor(rnd() * all.length)]);
    const ov: Record<string, boolean> = {};
    for (let i = 0, c = Math.floor(rnd() * 8); i < c; i++) ov[keys[Math.floor(rnd() * keys.length)]] = rnd() < 0.5;
    combos++;
    const d = roundTrip({ roles, permissionOverrides: ov });
    if (d.length) bad.push(`${roles.join("+")}: ${d[0]}`);
  }
  assert.deepEqual(bad, []);
});
let overrideCases = 0;
await t("every override key switched on and off on top of every role of its product", () => {
  const bad: string[] = [];
  for (const e of CATALOGUE.filter((x) => x.overrideKey)) {
    const roles = [...new Set(featuresOf(e.product).flatMap((f) => FILE_ROLES[f.source] ?? []))].filter((r) => r !== "super_admin");
    for (const r of roles) for (const v of [true, false]) {
      overrideCases++;
      const d = roundTrip({ roles: [r], permissionOverrides: { [e.overrideKey!]: v } });
      if (d.length) bad.push(`${r} ${e.overrideKey}=${v}: ${d[0]}`);
    }
  }
  assert.deepEqual(bad, []);
});
await t("a role from every product at once, with overrides from several", () => {
  const roles = Object.values(FILE_ROLES).flat().filter((r) => r !== "super_admin");
  const unique = [...new Set(roles)];
  const ov: Record<string, boolean> = {};
  CATALOGUE.filter((e) => e.overrideKey).forEach((e, i) => { if (i % 3 === 0) ov[e.overrideKey!] = i % 2 === 0; });
  assert.deepEqual(roundTrip({ roles: unique, permissionOverrides: ov }), []);
});

console.log("director and self-service");
await t("the Director has write everywhere and an access map cannot reduce it", () => {
  for (const e of CATALOGUE) { assert.ok(can({ isDirector: true, access: {} }, e.product, e.key, "write")); assert.ok(can({ isDirector: true, access: { [e.product]: {} } }, e.product, e.key, e.level)); }
  const d = accessToLegacy({}, { isDirector: true });
  assert.deepEqual(d.roles, ["super_admin"]);
});
await t("every legacy capability is true for super_admin (the oracle agrees with the Director rule)", () => {
  const a = legacyAnswers({ roles: ["super_admin"], permissionOverrides: null });
  // the only features super_admin does not hold are the "only this tier" gates (employee-only, student-only): they are true for a plain employee
  assert.deepEqual(CATALOGUE.filter((e) => !a[e.key]).map((e) => e.key).sort(), ["hrms.isEmployeeOnly", "pms.isPmsEmployeeOnly", "prms.isEmployeeOnly", "tms.isStudentOnly"]);
});
await t("self-service features are on for everyone and never stored", () => {
  for (const s of SELF_SERVICE) assert.ok(can({ access: {} }, "me", s.key, "write"));
  assert.equal(can(null, "me", "me.tasks"), false);
  assert.equal(CATALOGUE.some((e) => e.key.startsWith("me.")), false);
});

console.log("two levels");
await t("write implies read; read does not imply write; absence is no access", () => {
  const w = CATALOGUE.find((e) => e.level === "write" && !isFinished(e.product))!; // finished products list micro features (their own tests)
  assert.ok(can({ access: { [w.product]: { [w.key]: "write" } } }, w.product, w.key, "read"));
  assert.ok(can({ access: { [w.product]: { [w.key]: "write" } } }, w.product, w.key, "write"));
  assert.equal(can({ access: { [w.product]: { [w.key]: "read" } } }, w.product, w.key, "write"), false);
  assert.equal(can({ access: {} }, w.product, w.key, "read"), false);
  assert.equal(can({ access: { [w.product]: { [w.key]: "write" } } }, "other", w.key, "read"), false);
});
await t("normalizeAccess drops unknown features, wrong products and bad levels; a view feature caps at read", () => {
  const w = CATALOGUE.find((e) => e.level === "write")!, r = CATALOGUE.find((e) => e.level === "read")!;
  const n = normalizeAccess({ [w.product]: { [w.key]: "write", nope: "read", [r.key]: "admin" }, bogus: { [w.key]: "read" }, [r.product]: { [r.key]: "write" } });
  assert.equal(n[w.product][w.key], "write");
  assert.equal(n[w.product].nope, undefined);
  assert.equal(n.bogus, undefined);
  assert.equal(n[r.product][r.key], "read");
});
await t("requireAccess throws AccessDeniedError and passes when allowed", () => {
  const w = CATALOGUE.find((e) => e.level === "write" && !isFinished(e.product))!; // finished products list micro features (their own tests)
  assert.throws(() => requireAccess({ access: {} }, w.product, w.key, "read"), AccessDeniedError);
  requireAccess({ access: { [w.product]: { [w.key]: "write" } } }, w.product, w.key, "write");
});

console.log("hand-made maps (what the 3-step People & Access screen will produce)");
await t("per-product presets 'Read Only' and 'Read & Write' are exact, except the two documented ones", () => {
  const inexact: string[] = [];
  for (const product of PRODUCTS) for (const mode of ["read", "write"] as const) {
    const access: AccessMap = { [product]: {} };
    for (const e of featuresOf(product)) if (e.kind !== "tier" && (mode === "write" || e.level === "read")) access[product][e.key] = e.level;
    const d = accessToLegacy(completeAccess(access));
    assert.deepEqual(d.withheld, [], `${product} ${mode}: a granted feature could not be expressed`);
    if (d.widened.length) inexact.push(`${product}/${mode}: ${d.widened.join(",")}`);
  }
  // Intentional differences (documented in docs/commandos-access-model.md): for these two read-only presets the lowest role that
  // grants the wanted read features also carries a manager/staff tier gate, so the legacy gate would be wider than the map.
  assert.deepEqual(inexact, ["agentos/read: aibots.isAibotsManagerTier", "evaliq/read: ots.isOtsStaff"]);
});
await t("a product baseline is written into the map and is the same for every person given the product", () => {
  for (const product of PRODUCTS) {
    const e = featuresOf(product).find((x) => x.kind !== "tier")!;
    const c = completeAccess({ [product]: { [e.key]: e.level } });
    for (const k of baselineFeatures(product)) assert.ok(granted(c, CATALOGUE.find((x) => x.key === k)!), `${product}: baseline ${k} missing`);
  }
  // nobody is without the Workspace basics (everyone gets the same shell), and nothing else is added for an empty choice
  // (the Workspace role also implies the employee-level basics of a few products: that is legacy behaviour, now written into the map)
  assert.ok("commandos" in completeAccess({}));
});
await t("150 random maps: never a silent difference; widened and withheld are always reported", () => {
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let exact = 0, withheld = 0, widened = 0, silent = 0;
  for (let n = 0; n < 150; n++) {
    const access: AccessMap = {};
    const p = 0.05 + rnd() * 0.2;
    for (const e of CATALOGUE) if (e.kind !== "tier" && rnd() < p) (access[e.product] ??= {})[e.key] = e.level === "read" ? "read" : rnd() < 0.5 ? "read" : "write";
    const c = completeAccess(access);
    const d = accessToLegacy(c);
    const actual = legacyAnswers({ roles: d.roles, permissionOverrides: d.permissionOverrides });
    const wrong = CATALOGUE.filter((e) => actual[e.key] !== granted(c, e)).map((e) => e.key).sort();
    if (JSON.stringify(wrong) !== JSON.stringify(d.conflicts.map((x) => x.key).sort())) silent++;
    if (!d.conflicts.length) exact++;
    if (d.withheld.length) withheld++;
    if (d.widened.length) widened++;
  }
  console.log(`      ${exact} exact, ${withheld} with withheld features, ${widened} with widened features, ${silent} silent differences`);
  assert.equal(silent, 0);
});

console.log("read model");
await t("describeAccess gives per-product counts, effective levels and the locked state", () => {
  const w = CATALOGUE.find((e) => e.level === "write" && !isFinished(e.product))!; // finished products list micro features (their own tests)
  const v = describeAccess({ [w.product]: { [w.key]: "write" } }, false);
  const pv = v.products.find((p) => p.product === w.product)!;
  assert.equal(pv.summary.write, 1);
  assert.equal(pv.features.find((f) => f.key === w.key)!.level, "write");
  assert.equal(isProductLocked(v, w.product), false);
  assert.equal(isProductLocked(v, PRODUCTS.find((p) => p !== w.product)!), true);
  assert.equal(isProductLocked(describeAccess({}, true), w.product), false);
  assert.equal(v.selfService.length, SELF_SERVICE.length);
  assert.equal(describeAccess({}, true).products.every((p) => p.features.every((f) => f.level !== "none")), true);
});

console.log(`\n${passed} tests passed; parity harness: ${checks} comparisons (${results.length} single roles, ${combos} role pairs, ${overrideCases} override cases), 0 differences`);
})().catch((e) => { console.error(e); process.exit(1); });
