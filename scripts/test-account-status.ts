/**
 * Account status rules (pure; nothing is read or written).
 *   npx tsx scripts/test-account-status.ts
 */
import assert from "node:assert/strict";
import { BLOCKED_STATUSES, LEFT_STATUSES, canSignIn, checkStatusChange, fromEmployeeStatus, statusOf, toEmployeeStatus, type AccountStatus, type StatusChangeInput } from "../src/lib/security/account-status";

let passed = 0;
const t = (name: string, fn: () => void) => { fn(); passed++; console.log(`  ✓ ${name}`); };
const base = (o: Partial<StatusChangeInput> = {}): StatusChangeInput => ({ actor: { id: "a", isDirector: true }, target: { id: "b", isDirector: false, status: "active" }, to: "deactivated", reason: "", lastWorkingDay: null, otherActiveDirectors: 1, today: "2026-10-25", ...o });

t("who can sign in", () => {
  for (const s of ["active", "probation", "on_leave", "notice_period"] as AccountStatus[]) assert.equal(canSignIn({ status: s, roles: ["x"] }), true, s);
  for (const s of ["suspended", "deactivated", "resigned", "terminated", "retired", "contract_ended"] as AccountStatus[]) assert.equal(canSignIn({ status: s, roles: ["x"] }), false, s);
});
t("accounts from before statuses: roles decide", () => {
  assert.equal(statusOf({ roles: ["employee"] }), "active");
  assert.equal(statusOf({ roles: [] }), "deactivated");
  assert.equal(statusOf({}), "deactivated");
  assert.equal(canSignIn({ roles: [] }), false);
  assert.equal(statusOf({ status: "nonsense", roles: ["hr"] }), "active");
  assert.equal(statusOf({ roles: [], platformRoleId: "r1" }), "active"); // platform staff
});
t("blocked and left lists", () => {
  assert.deepEqual([...BLOCKED_STATUSES].sort(), ["contract_ended", "deactivated", "resigned", "retired", "suspended", "terminated"]);
  assert.deepEqual([...LEFT_STATUSES].sort(), ["contract_ended", "resigned", "retired", "terminated"]);
});
t("the HR file follows the account", () => {
  assert.equal(toEmployeeStatus("resigned"), "relieved");
  assert.equal(toEmployeeStatus("retired"), "relieved");
  assert.equal(toEmployeeStatus("terminated"), "terminated");
  assert.equal(toEmployeeStatus("suspended"), "suspended");
  assert.equal(fromEmployeeStatus("relieved"), "resigned");
  assert.equal(fromEmployeeStatus("on_leave"), "on_leave");
  assert.equal(fromEmployeeStatus("zzz"), null);
});
t("a Director can deactivate someone", () => assert.equal(checkStatusChange(base()), null));
t("nobody changes their own status", () => assert.match(checkStatusChange(base({ target: { id: "a", isDirector: true, status: "active" } }))!, /your own/));
t("same status is refused", () => assert.match(checkStatusChange(base({ to: "active" }))!, /already/));
t("only a Director changes a Director", () => assert.match(checkStatusChange(base({ actor: { id: "a", isDirector: false }, target: { id: "b", isDirector: true, status: "active" } }))!, /Only a Director/));
t("the last Director cannot be blocked", () => {
  assert.match(checkStatusChange(base({ target: { id: "b", isDirector: true, status: "active" }, otherActiveDirectors: 0 }))!, /at least one Director/);
  assert.equal(checkStatusChange(base({ target: { id: "b", isDirector: true, status: "active" }, otherActiveDirectors: 1 })), null);
  assert.equal(checkStatusChange(base({ target: { id: "b", isDirector: true, status: "active" }, to: "on_leave", otherActiveDirectors: 0 })), null);
});
t("suspending and terminating need a reason", () => {
  assert.match(checkStatusChange(base({ to: "suspended" }))!, /reason/);
  assert.equal(checkStatusChange(base({ to: "suspended", reason: "Under enquiry" })), null);
  assert.match(checkStatusChange(base({ to: "terminated", reason: "x", lastWorkingDay: "2026-10-25" }))!, /reason/);
});
t("notice and leaving need a last working day", () => {
  for (const to of ["notice_period", "resigned", "retired", "contract_ended"] as AccountStatus[]) {
    assert.match(checkStatusChange(base({ to }))!, /last working day/i, to);
    assert.equal(checkStatusChange(base({ to, lastWorkingDay: "2026-11-30" })), null, to);
  }
  assert.match(checkStatusChange(base({ to: "resigned", lastWorkingDay: "31/11/2026" }))!, /last working day/i);
});
t("a very long reason is refused", () => assert.match(checkStatusChange(base({ to: "suspended", reason: "x".repeat(501) }))!, /500/));
console.log(`\n${passed} checks passed.`);
