
import { can as accessCan2 } from "../src/lib/access/can";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { getDb } from "../src/lib/mongodb";
import { setAccess, subjectFromRow } from "../src/lib/access/server";
import { legacyToAccess, accessToLegacy, completeAccess } from "../src/lib/access/adapter";
import { legacyAnswers } from "../src/lib/access/legacy";
import { CATALOGUE } from "../src/lib/access/catalogue";
import { microOf } from "../src/lib/access/micro";
import * as NEW from "../src/lib/fms-access";
import * as OLD from "../src/lib/fms-roles";
import { splitPicked, checkAccess } from "../src/lib/products/commandos/people";
import { buildAccessUi } from "../src/lib/access/ui-model";

// Director vs partial vs old user vs Read only in AgentOS. Throwaway database only.
let passed = 0;
const T = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log("  ✓", name); };
const P = "cashflow-ai";
const k = (s: string) => `${P}.${s}`;
const ROLES = ["fms_admin", "finance_manager", "accountant", "finance_executive", "payroll_accountant", "accounts_receivable", "accounts_payable", "auditor", "finance_read_only"] as const;
const PAIRS: [keyof typeof NEW & keyof typeof OLD][] = [["canManageTransactions"], ["canApproveTransactions"], ["canManageAccounts"], ["canViewAuditLog"], ["canViewReports"], ["canViewPayrollFinance"], ["canViewCommercialFinance"], ["canViewBanking"], ["canViewFinancialStatements"], ["canReconcile"], ["canManageBanking"], ["canManageTaxConfig"], ["canManageFiscalPeriods"], ["canManageCompliance"], ["canManagePaymentLinks"], ["canRefundPayments"], ["isFmsAdmin"]];

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();
  await runAsCompany("co_cf2", async () => {
    const db = await getDb();
    const people = db.collection("admin_users");
    const mk = (roles: string[], ov: Record<string, boolean> | null = null) => ({ _id: new ObjectId(), email: roles.join("_") + (ov ? "_ov" : "") + "@x", roles, ...(ov ? { permissionOverrides: ov } : {}) });
    const rows = Object.fromEntries(ROLES.map((r) => [r, mk([r])]));
    const extra = { director: mk(["super_admin"]), partial: mk(["employee"]), readOnly: mk(["employee"]), bothPayroll: mk(["payroll_accountant", "accounts_receivable"]), ovAuditor: mk(["finance_read_only"], { "fms.canViewAuditLog": true }) };
    await people.insertMany([...Object.values(rows), ...Object.values(extra)] as never);
    const subjectOf = (row: { roles: string[]; permissionOverrides?: Record<string, boolean> }) => subjectFromRow(row as never);
    const ctxOf = (row: { roles: string[]; permissionOverrides?: Record<string, boolean> }) => ({ roles: row.roles, permissionOverrides: row.permissionOverrides ?? null }) as never;
    const set = async (row: { _id: ObjectId }, picks: Record<string, "read" | "write">) => { const r = await setAccess(String(row._id), { [P]: picks }, "test"); assert.ok(r.ok, JSON.stringify(r)); };

    await T("parity: old finance roles give exactly the micro features their legacy capabilities give; the matrix round-trips with 0 widened and 0 withheld", async () => {
      const cases: [string[], Record<string, boolean> | null][] = [...ROLES.map((r) => [[r], null] as [string[], null]), [["payroll_accountant", "accounts_receivable"], null], [["finance_read_only"], { "fms.canViewAuditLog": true }], [["accountant"], { "fms.canApproveTransactions": true }], [["finance_manager"], { "fms.canManageBanking": false }]];
      for (const [roles, ov] of cases) {
        const legacy = legacyAnswers({ roles, permissionOverrides: ov as never });
        const { access } = legacyToAccess({ roles, permissionOverrides: ov as never });
        for (const m of microOf(P)) assert.equal(Boolean(access[P]?.[m.key]), m.legacy.every((x) => legacy[x]), `${m.key} for ${roles} ${JSON.stringify(ov)}`);
        const d = accessToLegacy(completeAccess(access)); assert.deepEqual(d.widened, [], `widened ${roles} ${JSON.stringify(ov)}`); assert.deepEqual(d.withheld, [], `withheld ${roles} ${JSON.stringify(ov)}`);
      }
    });
    await T("every old capability name answers exactly like the old role file for every old role and override", async () => {
      for (const row of [...Object.values(rows), extra.director, extra.bothPayroll, extra.ovAuditor]) {
        for (const [name] of PAIRS) assert.equal((NEW[name] as (h: { subject: unknown }) => boolean)({ subject: subjectOf(row) } as never), (OLD[name] as (u: never) => boolean)(ctxOf(row)), `${name} for ${row.email}`);
        assert.equal(NEW.canMoveRefund({ subject: subjectOf(row) }, "requested", "approved"), OLD.canMoveRefund(ctxOf(row), "requested", "approved"), `refund decision ${row.email}`);
        assert.equal(NEW.canMoveRefund({ subject: subjectOf(row) }, "approved", "completed"), OLD.canMoveRefund(ctxOf(row), "approved", "completed"), `refund run ${row.email}`);
      }
    });
    await T("module pages: a payroll-only account does not see commercial pages, a read-only account sees the books, and each module view follows its group", async () => {
      const pay = { subject: subjectOf(rows.payroll_accountant) }; const ro = { subject: subjectOf(rows.finance_read_only) };
      assert.equal(NEW.fmsCan(pay, "customers.view"), false); assert.equal(NEW.fmsCan(pay, "payrollruns.view"), true);
      assert.equal(NEW.fmsCan(ro, "customers.view"), true); assert.equal(NEW.fmsCan(ro, "payrollruns.view"), false);
      assert.equal(NEW.fmsCan(pay, "transactions.view"), true, "open modules stay open to everyone given CashFlow");
      assert.equal(NEW.fmsCan(pay, "nonexistent.x"), false);
    });
    await T("Director: every micro feature", async () => { const s = subjectOf(extra.director); for (const m of microOf(P)) assert.ok(NEW.fmsCan({ subject: s }, m.key.slice(P.length + 1)), m.key); });
    await T("Read only is truly read only: the preset has no write feature, and a person with exactly it can look but change and approve nothing", async () => {
      const pre = buildAccessUi().presets[P]; assert.equal(pre.readLabel, "Read only");
      await set(extra.readOnly, Object.fromEntries(pre.read.map((x) => [x, "read" as const])));
      const subj = subjectOf((await people.findOne({ _id: extra.readOnly._id })) as never);
      for (const m of microOf(P)) if (m.level === "write") assert.equal(accessCan2(subj, P, m.key, "write"), false, `${m.key} must not come with Read only`);
      assert.equal(NEW.canViewFinancialStatements({ subject: subj }), true);
      assert.equal(NEW.canManageTransactions({ subject: subj }), false);
    });
    await T("partial person and removal on the next request", async () => {
      await set(extra.partial, { [k("customers.view")]: "read", [k("transactions.manage")]: "write" });
      let s = { subject: subjectOf((await people.findOne({ _id: extra.partial._id })) as never) };
      assert.ok(NEW.fmsCan(s, "customers.view") && NEW.canManageTransactions(s));
      for (const f of ["bankaccounts.view", "reports.view", "transactions.approve", "accounts.manage", "payrollruns.view"]) assert.equal(NEW.fmsCan(s, f), false, f);
      await set(extra.partial, { [k("customers.view")]: "read" });
      s = { subject: subjectOf((await people.findOne({ _id: extra.partial._id })) as never) };
      assert.equal(NEW.canManageTransactions(s), false);
    });
    await T("old-role people open prefilled in micro features and re-saving changes nothing they can do", async () => {
      for (const row of [rows.accountant, rows.payroll_accountant, rows.finance_manager, rows.auditor]) {
        const { access } = legacyToAccess({ roles: row.roles, permissionOverrides: null });
        const picked = splitPicked(access); assert.ok(Object.keys(picked[P] ?? {}).every((x) => x.split(".").length === 3));
        const c = checkAccess(picked); assert.deepEqual(c.widened, []); assert.deepEqual(c.withheld, []);
        for (const m of microOf(P)) assert.equal(Boolean(c.access[P]?.[m.key]), Boolean(access[P]?.[m.key]), `${m.key} for ${row.email}`);
      }
    });
  });
  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
