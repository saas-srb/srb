import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { cleanName, nameKey, makeCode, findDuplicate, usageReason, EMPTY_USAGE, matchByName, toOptions, filterByDepartment, canonicalDepartmentKey } from "../src/lib/platform/organization/rules";
import { DEFAULT_DEPARTMENTS } from "../src/lib/platform/organization/defaults";
import { planSopDepartments, planTextValues } from "../src/lib/platform/organization/migration-plan";

// Pure: no database. Run with: npx tsx scripts/test-organization.ts
let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };
const ROOT = path.resolve(__dirname, "..");

console.log("rules");
t("names are cleaned and compared case-insensitively with spaces collapsed", () => {
  assert.equal(cleanName("  Human   Resources "), "Human Resources");
  assert.equal(nameKey("  HUMAN  resources"), nameKey("human resources"));
  assert.equal(cleanName(42), "");
});
t("codes are unique and short", () => {
  const taken = new Set(["HR"]);
  assert.equal(makeCode("HR", taken), "HR2");
  assert.equal(makeCode("Finance", new Set()), "FINA");
  assert.equal(makeCode("!!!", new Set()), "DEP");
});
t("uniqueness is per scope: same team name allowed in two departments, not twice in one", () => {
  const rows = [{ _id: "t1", name: "Alpha", scope: "d1" }];
  assert.ok(findDuplicate(rows, " alpha ", "d1"));
  assert.equal(findDuplicate(rows, "Alpha", "d2"), null);
  assert.equal(findDuplicate(rows, "Alpha", "d1", "t1"), null);
});
t("usage reasons are plain and empty when free", () => {
  assert.equal(usageReason("department", EMPTY_USAGE), null);
  assert.match(usageReason("department", { ...EMPTY_USAGE, employees: 2, teams: 1 })!, /2 employee\(s\), 1 team\(s\)/);
  assert.match(usageReason("designation", { ...EMPTY_USAGE, people: 1 })!, /designation is in use/);
});
t("starter departments: unique names and codes, 32 of them, only defined here", () => {
  assert.equal(DEFAULT_DEPARTMENTS.length, 32);
  assert.equal(new Set(DEFAULT_DEPARTMENTS.map((d) => nameKey(d.name))).size, 32);
  assert.equal(new Set(DEFAULT_DEPARTMENTS.map((d) => d.code)).size, 32);
  for (const d of DEFAULT_DEPARTMENTS) assert.match(d.code, /^[A-Z0-9]{1,12}$/);
});

console.log("mapping");
const org = [{ _id: "o1", name: "Human Resources", code: "HR" }, { _id: "o2", name: "Finance", code: "FIN" }, { _id: "o3", name: "Information Technology", code: "IT" }];
t("matching is exact first, then by alias, never fuzzy", () => {
  assert.equal(matchByName(org, "finance").how, "exact");
  assert.equal(matchByName(org, "HR").match?._id, "o1");
  assert.equal(matchByName(org, "HR").how, "alias");
  assert.equal(matchByName(org, "IT").match?._id, "o3");
  assert.equal(matchByName(org, "Marketing").match, null);
  assert.equal(canonicalDepartmentKey("Accounts & Finance"), "finance");
});
t("plan: links by name, creates the missing one once, skips already linked, never double-links", () => {
  const sop = [
    { _id: "s1", name: "HR", code: "HR", hrmsDepartmentId: null },
    { _id: "s2", name: "Finance", code: "FIN", hrmsDepartmentId: null },
    { _id: "s3", name: "Marketing", code: "MKT", hrmsDepartmentId: null },
    { _id: "s4", name: "marketing", code: "MKT2", hrmsDepartmentId: null },
    { _id: "s5", name: "IT", code: "IT", hrmsDepartmentId: "o3" },
    { _id: "s6", name: "Human Resources", code: "HRX", hrmsDepartmentId: null },
  ];
  const plan = planSopDepartments(org, sop);
  const by = (id: string) => plan.find((a) => "sopId" in a && a.sopId === id)!;
  assert.equal(by("s1").kind, "link");
  assert.equal(by("s2").kind, "link");
  assert.equal(by("s5").kind, "skip-linked");
  assert.equal(by("s3").kind, "create-and-link");
  assert.equal(by("s4").kind, "create-and-link"); // "marketing" is the same name as s3: one department is created for both
  assert.equal((by("s4") as { code: string }).code, (by("s3") as { code: string }).code);
  // o1 is taken by s1, so a second copy of HR cannot link to it again: it is reported as a conflict, never duplicated
  assert.equal(by("s6").kind, "conflict");
  const codes = plan.filter((a) => a.kind === "create-and-link").map((a) => (a as { code: string }).code);
  assert.equal(codes.filter((c) => c === "HR").length, 0, "a new code must not collide with an existing one");
});
t("text values: matched ones get an id, unmatched are listed and left as text", () => {
  const p = planTextValues(org, [{ text: "Finance", count: 3 }, { text: "Warehouse", count: 1 }]);
  assert.equal(p.distinct[0].orgId, "o2");
  assert.deepEqual(p.unmatched, ["Warehouse"]);
});

console.log("picker contract");
t("options are sorted, carry the department, and filter by it", () => {
  const o = toOptions("team", [{ _id: "b", name: "Beta", departmentId: "d1" }, { _id: "a", name: "Alpha", departmentId: "d2" }]);
  assert.deepEqual(o.map((x) => x.label), ["Alpha", "Beta"]);
  assert.deepEqual(filterByDepartment(o, "d1").map((x) => x.value), ["b"]);
  assert.equal(filterByDepartment(o, null).length, 2);
  assert.equal(toOptions("designation", [{ _id: "x", title: "Manager", departmentId: "d1" }])[0].label, "Manager");
  assert.equal(toOptions("department", [{ _id: "d", name: "HR", code: "HR" }])[0].hint, "HR");
});

console.log("static: no product file defines its own department list");
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
const SRC = path.join(ROOT, "src");
const files = walk(SRC);
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
// Content catalogues that merely OFFER department names (templates, KPIs, demo copy), not stores or pickers.
const CONTENT = [/^src\/lib\/platform\/onboarding\/catalog\.ts$/, /^src\/lib\/products\/playbook-ai\/(catalogue|item-library|templates)/, /^src\/app\/dev-editor-harness\//, /^src\/lib\/platform\/designations\.ts$/, /^src\/lib\/products\/contractflow-ai\/entity-discovery\.ts$/, /^src\/lib\/platform\/saas\//];
t("the 32-name starter list exists in exactly one file", () => {
  const hits = files.filter((f) => /name: "Risk Management", code: "RSK"/.test(readFileSync(f, "utf8")));
  assert.deepEqual(hits.map(rel), ["src/lib/platform/organization/defaults.ts"]);
});
t("no file outside the organization module hard-codes the canonical collection names", () => {
  const bad = files.filter((f) => !rel(f).startsWith("src/lib/platform/organization/") && /["'`]hrms_(departments|designations|teams)["'`]/.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad.map(rel), []);
});
t("only the organization module and the SOP mirror touch sop_departments by name", () => {
  const ok = [/^src\/lib\/platform\/organization\//, /^src\/lib\/products\/playbook-ai\/db\.ts$/, /^src\/lib\/products\/playbook-ai\/pb-collections\.ts$/];
  const bad = files.filter((f) => !ok.some((r) => r.test(rel(f))) && /["'`]sop_departments["'`]/.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad.map(rel), []);
});
t("no product file declares its own department array (const departments = [ {name: ...} ])", () => {
  const re = /(const|let)\s+\w*[Dd]epartments?\w*\s*(:[^=]+)?=\s*\[\s*\{\s*(name|label)\s*:\s*["']/;
  const bad = files.filter((f) => !CONTENT.some((r) => r.test(rel(f))) && re.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad.map(rel), []);
});
t("Playbook no longer exports its own starter departments", () => {
  assert.equal(/DEFAULT_DEPARTMENTS/.test(readFileSync(path.join(SRC, "lib/products/playbook-ai/constants.ts"), "utf8")), false);
});
t("the Organization module stays free of permission logic", () => {
  for (const f of walk(path.join(SRC, "lib/platform/organization"))) {
    const s = readFileSync(f, "utf8");
    assert.equal(/-roles"|hasAdminAccess|permissionOverrides|requireAccess/.test(s), false, rel(f));
  }
});
t("OrgPicker is used by the SpendIQ forms", () => {
  for (const n of ["ExpenseForm", "PurchaseOrderForm", "RequisitionForm", "RfqForm"]) {
    assert.match(readFileSync(path.join(SRC, `components/products/spendiq/${n}.tsx`), "utf8"), /<OrgPicker kind="department"/);
  }
});

console.log(`\n${passed} passed`);
