import assert from "node:assert/strict";
import { peopleScopeFor, ownOrStaff, peopleFilter, type PeopleFeature } from "../src/lib/access/scope";
import { CATALOGUE } from "../src/lib/access/catalogue";
import { legacyToAccess, accessToLegacy, completeAccess } from "../src/lib/access/adapter";
import { microOf } from "../src/lib/access/micro";
import type { AccessSubject } from "../src/lib/access/can";
import { STAGED } from "../src/lib/access/micro/staged";
import { FINISHED_PANELS } from "../src/lib/ai/agent/micro-gate";

// The shared pieces of the staff products (TalentOS, SprintOS, SpendIQ, CohortAI, Playbook): staff tier in the catalogue, own / team / all scope, adapter baseline. Pure.
let passed = 0;
const T = (name: string, fn: () => void) => { fn(); passed++; console.log("  ✓", name); };
const F: PeopleFeature = { product: "talentos", all: "talentos.leave.all", team: "talentos.leave.team", own: "talentos.leave.view" };
const subj = (access: Record<string, "read" | "write">): AccessSubject => ({ isDirector: false, access: { talentos: access } });

T("the catalogue knows the staff tier and the product entry gate of every staff product (they were invisible before)", () => {
  for (const k of ["hrms.hasStaffRole", "hrms.hasAnyHrmsRole", "pms.hasPmsStaffRole", "prms.hasPrmsStaffRole", "tms.hasTmsStaffRole"]) assert.ok(CATALOGUE.find((e) => e.key === k && e.kind === "tier"), k);
  assert.ok(!CATALOGUE.find((e) => e.key === "messenger.hasChatStaffRole"), "a capability that takes a user (hasChatStaffRole) is not a tier gate");
});
T("scope: all beats team beats own beats none, per level; a Director is always all", () => {
  assert.equal(peopleScopeFor({ isDirector: true }, F), "all");
  assert.equal(peopleScopeFor(subj({ "talentos.leave.all": "read" }), F), "all");
  assert.equal(peopleScopeFor(subj({ "talentos.leave.team": "read", "talentos.leave.view": "read" }), F), "team");
  assert.equal(peopleScopeFor(subj({ "talentos.leave.view": "read" }), F), "own");
  assert.equal(peopleScopeFor(subj({}), F), "none");
  assert.equal(peopleScopeFor(null, F), "none");
  assert.equal(peopleScopeFor(subj({ "talentos.leave.team": "read" }), F, "write"), "none", "a read-level pick is not a write");
  assert.equal(peopleScopeFor(subj({ "talentos.leave.team": "write" }), F, "write"), "team");
});
T("ownOrStaff: own sees only the person's record, team adds the reporting line (never a stranger), all sees everything, none nothing", () => {
  const me = { id: "e1", line: new Set(["e2", "e3"]) };
  assert.ok(ownOrStaff("own", "e1", me) && !ownOrStaff("own", "e2", me));
  assert.ok(ownOrStaff("team", "e1", me) && ownOrStaff("team", "e3", me) && !ownOrStaff("team", "e9", me));
  assert.ok(ownOrStaff("all", "e9", me) && ownOrStaff("all", null, me));
  assert.ok(!ownOrStaff("none", "e1", me));
  assert.ok(!ownOrStaff("own", null, me) && !ownOrStaff("team", undefined, me), "a record with no owner is never matched by a narrow scope");
  assert.ok(!ownOrStaff("own", "e1", { id: null }), "a person with no employee record owns nothing");
  assert.ok(ownOrStaff("team", "e2", { id: "e1", line: ["e2"] }), "the line may be an array");
});
T("peopleFilter: the same rule as a query", () => {
  const me = { id: "e1", line: ["e2", "e3"] };
  assert.deepEqual(peopleFilter("all", "employeeId", me), {});
  assert.deepEqual(peopleFilter("own", "employeeId", me), { employeeId: "e1" });
  assert.deepEqual(peopleFilter("team", "employeeId", me), { employeeId: { $in: ["e1", "e2", "e3"] } });
  assert.equal(peopleFilter("none", "employeeId", me), null);
  assert.equal(peopleFilter("own", "employeeId", { id: null }), null);
});
T("former employees keep exactly their access: employee, manager and HR roles round-trip through the staged TalentOS catalogue with nothing widened or withheld in TalentOS", () => {
  const P = "talentos";
  for (const [roles, ov] of [[["employee"], null], [["manager"], null], [["hr"], null], [["hr"], { "hrms.canManagePayroll": false }], [["manager"], { "hrms.canViewAllEmployees": true }]] as const) {
    const { access } = legacyToAccess({ roles: [...roles], permissionOverrides: ov as never });
    const held = microOf(P).filter((m) => access[P]?.[m.key]);
    assert.ok(held.length >= 16, `${roles} keeps at least the employee level`);
    const d = accessToLegacy(completeAccess(access));
    assert.deepEqual(d.widened.filter((k) => k.startsWith("hrms.")), [], `widened ${roles}`);
    assert.deepEqual(d.withheld.filter((k) => k.startsWith("hrms.")), [], `withheld ${roles}`);
  }
  const emp = legacyToAccess({ roles: ["employee"], permissionOverrides: null }).access[P] ?? {};
  assert.ok(emp["talentos.leave.view"] && emp["talentos.leave.apply"] && emp["talentos.salary.view"], "an employee has the own-record features");
  assert.ok(!emp["talentos.leave.team"] && !emp["talentos.leave.approve"] && !emp["talentos.employees.all"], "and not the staff ones");
  const mgr = legacyToAccess({ roles: ["manager"], permissionOverrides: null }).access[P] ?? {};
  assert.ok(mgr["talentos.leave.team"] && mgr["talentos.leave.approve"] && mgr["talentos.attendance.team"], "a manager has the reporting-line features");
  assert.ok(!mgr["talentos.leave.all"] && !mgr["talentos.payroll.run"] && !mgr["talentos.employees.all"], "but not everyone's records or payroll");
  const hr = legacyToAccess({ roles: ["hr"], permissionOverrides: null }).access[P] ?? {};
  assert.ok(hr["talentos.employees.all"] && hr["talentos.leave.all"] && hr["talentos.payroll.run"] && hr["talentos.employees.manage"]);
});
T("giving the reporting-line scope derives the staff tier and what that role bundles, with no widening", () => {
  const picked = { talentos: { "talentos.leave.view": "read", "talentos.leave.team": "read" } } as never;
  const d = accessToLegacy(completeAccess(picked));
  assert.ok(d.roles.includes("manager") || d.roles.includes("hr"), "a role that carries the staff tier");
  assert.deepEqual(d.widened.filter((k) => k.startsWith("hrms.")), []);
  assert.deepEqual(d.withheld.filter((k) => k.startsWith("hrms.")), []);
});
T("staged conversion is consistent: every module of a staged product is converted or pending (never both, never missing), and its Ask-AI panel is finished only when nothing is pending", () => {
  for (const [product, st] of Object.entries(STAGED)) {
    const modules = [...new Set(microOf(product).map((m) => m.module))].sort();
    assert.deepEqual([...st.converted, ...st.pending].sort(), modules, `${product}: modules listed once`);
    assert.equal(st.panel in FINISHED_PANELS, st.pending.length === 0, `${product}: the Ask-AI panel is finished only when every module is converted`);
  }
});

console.log(`\n${passed} passed`);
