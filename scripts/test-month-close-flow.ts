import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { listAccounts, seedDefaultAccounts } from "../src/lib/products/cashflow-ai/accounts";
import { createBankAccount } from "../src/lib/products/cashflow-ai/bank-accounts";
import { createStatementLine } from "../src/lib/products/cashflow-ai/bank-reconciliation";
import { createCashAccount, listCashAccounts } from "../src/lib/products/cashflow-ai/cash-accounts";
import { recordCashCount } from "../src/lib/products/cashflow-ai/cash-reconciliation";
import { createFiscalPeriod, listFiscalPeriods } from "../src/lib/products/cashflow-ai/fiscal-periods";
import { SETTLEMENTS_COLLECTION } from "../src/lib/products/cashflow-ai/payments/settlements";
import { JOURNAL_LINES_COLLECTION } from "../src/lib/products/cashflow-ai/journal";
import { monthBounds } from "../src/lib/products/cashflow-ai/month-close/core";
import { canManageFiscalPeriods, canReconcile } from "../src/lib/fms-roles";
import { MONTH_CLOSE_COLLECTION, clearStep, gatherMonthFacts, getMonthClose, listStepRecords, lockMonth, recordOverride, recordStep, removeOverride } from "../src/lib/products/cashflow-ai/month-close/store";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*). Never point it at a real one.
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: "fin@example.com" };
const A = <T>(fn: () => Promise<T>) => runAsCompany("co_close_a", fn);
const B = <T>(fn: () => Promise<T>) => runAsCompany("co_close_b", fn);
const M = "2024-02"; // leap February: the 29th must count, 1 March must not
const now = new Date();
const stamp = { createdAt: now, updatedAt: now, createdBy: "u1", updatedBy: "u1", deletedAt: null };
const stepOf = async (month: string, key: string) => (await getMonthClose(month)).steps.find((s) => s.key === key)!;
const period = (month: string) => createFiscalPeriod({ name: `P ${month}`, startDate: new Date(`${month}-01T00:00:00`), endDate: new Date(`${monthBounds(month).to}T23:59:59`) }, "u1");

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await A(async () => {
    const db = await getDb();
    await seedDefaultAccounts("u1");

    await t("a month with nothing in it: every data step passes, person steps are to do", async () => {
      const v = await getMonthClose(M);
      for (const s of v.steps.filter((x) => x.kind === "data")) assert.equal(s.status, s.key === "payroll_done" ? "failing" : "passed", s.key);
      assert.equal(v.steps.find((s) => s.key === "payroll_done")!.status, "failing", "no approved payroll run is reported, not assumed fine");
    });

    await t("bank: unmatched lines count only inside the month (29 Feb in, 1 Mar and 31 Jan out)", async () => {
      const bank = await createBankAccount({ accountName: "HDFC", bankName: "HDFC", accountNumber: null, ifsc: null, branch: null, currency: "INR", openingBalance: 0, status: "active", notes: null }, "u1");
      assert.ok(bank.ok);
      if (!bank.ok) return;
      const mk = (d: string) => createStatementLine({ bankAccountId: bank.account._id, statementDate: d, description: "x", amount: 100, notes: null }, "u1");
      await mk("2024-01-31"); await mk("2024-03-01");
      assert.equal((await stepOf(M, "bank_reconciled")).status, "passed");
      const line = await mk("2024-02-29");
      assert.equal((await stepOf(M, "bank_reconciled")).status, "failing");
      await db.collection("fms_bank_statement_lines").updateOne({ _id: line._id }, { $set: { status: "matched" } });
      assert.equal((await stepOf(M, "bank_reconciled")).status, "passed");
      await db.collection("fms_bank_statement_lines").updateOne({ _id: line._id }, { $set: { status: "needs_review" } });
      assert.equal((await stepOf(M, "bank_reconciled")).status, "failing", "needs review is not reconciled");
      await db.collection("fms_bank_statement_lines").updateOne({ _id: line._id }, { $set: { status: "matched" } });
    });

    await t("settlements: ready or review in the month fail; booked or another month do not", async () => {
      const col = db.collection(SETTLEMENTS_COLLECTION);
      const mk = (id: string, settledOn: string, status: string) => col.insertOne({ _id: id, settlementId: id, settledOn, status, ...stamp } as never);
      await mk("s_other", "2024-03-01", "ready"); await mk("s_booked", "2024-02-10", "booked");
      assert.equal((await stepOf(M, "settlements_booked")).status, "passed");
      await mk("s_review", "2024-02-11", "review");
      assert.equal((await stepOf(M, "settlements_booked")).status, "failing");
      await col.updateOne({ _id: "s_review" } as never, { $set: { status: "ready" } });
      assert.equal((await stepOf(M, "settlements_booked")).status, "failing");
      await col.updateOne({ _id: "s_review" } as never, { $set: { status: "booked" } });
      assert.equal((await stepOf(M, "settlements_booked")).status, "passed");
    });

    await t("cash: an active account needs a count inside the month", async () => {
      const acc = await createCashAccount({ accountName: "Petty cash", location: null, department: null, currency: "INR", status: "active", notes: null, openingBalance: 500 }, "u1");
      assert.equal((await stepOf(M, "cash_counted")).status, "failing");
      await recordCashCount({ cashAccountId: acc._id, countDate: "2024-03-01", physicalCount: 500, notes: null }, "u1", null);
      assert.equal((await stepOf(M, "cash_counted")).status, "failing", "a count on 1 March is not February's");
      await recordCashCount({ cashAccountId: acc._id, countDate: "2024-02-29", physicalCount: 500, notes: null }, "u1", null);
      assert.equal((await stepOf(M, "cash_counted")).status, "passed");
    });

    await t("payroll: needs an approved run and every due paid", async () => {
      await db.collection("hrms_payroll_runs").insertOne({ _id: "run1", month: M, status: "draft", ...stamp } as never);
      assert.equal((await stepOf(M, "payroll_done")).status, "failing", "a draft run is not approved");
      await db.collection("hrms_payroll_runs").updateOne({ _id: "run1" } as never, { $set: { status: "approved" } });
      assert.equal((await stepOf(M, "payroll_done")).status, "passed", "approved, nothing due");
      await db.collection("hrms_payslips").insertOne({ _id: "ps1", runId: "run1", month: M, deductions: [{ code: "TDS", name: "TDS", amount: 1000 }], employerContributions: [], workState: null } as never);
      const s = await stepOf(M, "payroll_done");
      assert.equal(s.status, "failing", "TDS withheld and not yet paid");
      assert.match(s.detail, /not marked paid/);
    });

    await t("bills, receipts and entries without an account: counted by month", async () => {
      const bills = db.collection("prms_invoices");
      const bill = (id: string, invoiceDate: string, storageKey: string | null) => bills.insertOne({ _id: id, invoiceNumber: id, vendorId: "v1", vendorName: "V", vendorInvoiceNumber: id, invoiceDate, totalAmount: 10, status: "approved", storageKey, ...stamp } as never);
      await bill("b_other", "2024-03-01", null); await bill("b_ok", "2024-02-05", "k");
      assert.equal((await stepOf(M, "bills_documented")).status, "passed");
      await bill("b_bad", "2024-02-29", null);
      assert.equal((await stepOf(M, "bills_documented")).status, "failing");

      const rc = db.collection("fms_receipts");
      const receipt = (id: string, d: string, documents: unknown[]) => rc.insertOne({ _id: id, receiptNumber: id, customerName: "C", receiptDate: new Date(`${d}T12:00:00Z`), amount: 5, method: "cash", status: "completed", notes: null, documents, ...stamp } as never);
      await receipt("r_other", "2024-03-02", []); await receipt("r_ok", "2024-02-10", [{ key: "k" }]);
      assert.equal((await stepOf(M, "receipts_proved")).status, "passed");
      await receipt("r_bad", "2024-02-10", []);
      assert.equal((await stepOf(M, "receipts_proved")).status, "failing");

      const tx = db.collection("fms_transactions");
      const txn = (id: string, d: string, accountId: string | null) => tx.insertOne({ _id: id, transactionNumber: id, type: "expense", status: "completed", amount: 3, description: null, accountId, transferId: null, transactionDate: new Date(`${d}T12:00:00Z`), ...stamp } as never);
      await txn("t_other", "2024-01-31", null); await txn("t_ok", "2024-02-10", "acc");
      assert.equal((await stepOf(M, "entries_classified")).status, "passed");
      await txn("t_bad", "2024-02-10", null);
      assert.equal((await stepOf(M, "entries_classified")).status, "failing");
    });

    await t("trial balance: an unbalanced ledger fails", async () => {
      assert.equal((await stepOf(M, "trial_balance")).status, "passed");
      const [a1, a2] = await listAccounts(); // only real chart accounts appear in the trial balance
      await db.collection(JOURNAL_LINES_COLLECTION).insertOne({ _id: "jl1", entryId: "e1", entryDate: new Date("2024-02-10T12:00:00"), accountId: a1._id, accountCode: a1.code, accountName: a1.name, side: "debit", amount: 50, currency: "INR", transactionId: null, transactionNumber: null, description: null, createdAt: now } as never);
      assert.equal((await stepOf(M, "trial_balance")).status, "failing");
      await db.collection(JOURNAL_LINES_COLLECTION).insertOne({ _id: "jl2", entryId: "e1", entryDate: new Date("2024-03-01T12:00:00"), accountId: a2._id, accountCode: a2.code, accountName: a2.name, side: "credit", amount: 50, currency: "INR", transactionId: null, transactionNumber: null, description: null, createdAt: now } as never);
      assert.equal((await stepOf(M, "trial_balance")).status, "failing", "the credit is dated after the month end, so the month is still unbalanced");
      await db.collection(JOURNAL_LINES_COLLECTION).deleteMany({});
    });

    await t("an unreadable fact is never passed", async () => {
      const boom = async () => { throw new Error("db down"); };
      const f = await gatherMonthFacts(M, { unmatchedBankLines: boom, trialBalance: boom, payroll: boom, accrual: boom });
      assert.equal(f.unmatchedBankLines, undefined);
      assert.equal(f.trialBalance, undefined);
      assert.equal(f.payrollApproved, undefined);
      assert.equal(f.settlementsOpen, 0, "the other readings still work");
      const v = await getMonthClose(M, { unmatchedBankLines: boom, trialBalance: boom });
      assert.equal(v.steps.find((s) => s.key === "bank_reconciled")!.status, "unknown");
      assert.equal(v.steps.find((s) => s.key === "trial_balance")!.status, "unknown");
      assert.ok(v.blockingKeys.includes("bank_reconciled"));
      assert.equal(v.steps.find((s) => s.key === "accrual_in_ledger")!.status, "passed", "accrual books off: nothing to tie out");
    });

    await t("person steps: recorded with who and when, validated, undoable; data steps and future months refused", async () => {
      assert.equal((await recordStep("nope", "depreciation_done", null, actor)).ok, false);
      assert.equal((await recordStep(M, "bank_reconciled", null, actor)).ok, false, "books-proven step");
      assert.equal((await recordStep(M, "lock", null, actor)).ok, false);
      assert.equal((await recordStep(M, "unknown_step", null, actor)).ok, false);
      assert.equal((await recordStep(M, "depreciation_done", "x".repeat(501), actor)).ok, false);
      assert.equal((await recordStep("2099-01", "depreciation_done", null, actor)).ok, false, "future month");
      assert.equal((await listStepRecords(M)).records.length, 0, "refusals stored nothing");
      assert.ok((await recordStep(M, "depreciation_done", "  none this month ", actor)).ok);
      const r = (await listStepRecords(M)).records[0];
      assert.equal(r.note, "none this month");
      assert.equal(r.recordedByEmail, "fin@example.com");
      assert.ok(r.recordedAt);
      const s = await stepOf(M, "depreciation_done");
      assert.equal(s.status, "recorded");
      assert.ok((await recordStep(M, "depreciation_done", "second look", { id: "u2", email: "b@example.com" })).ok);
      assert.equal((await listStepRecords(M)).records.length, 1, "same step again updates the one row");
      assert.equal((await listStepRecords(M)).records[0].recordedByEmail, "b@example.com");
      assert.ok((await clearStep(M, "depreciation_done", actor)).ok);
      assert.equal((await stepOf(M, "depreciation_done")).status, "todo");
    });

    await t("concurrent record of the same step leaves exactly one row", async () => {
      const results = await Promise.all(Array.from({ length: 12 }, (_, i) => recordStep(M, "ageing_reviewed", `n${i}`, { id: `u${i}`, email: null })));
      assert.ok(results.every((r) => r.ok));
      assert.equal(await db.collection(MONTH_CLOSE_COLLECTION).countDocuments({ month: M, stepKey: "ageing_reviewed" }), 1);
    });

    await t("permissions used by the actions: an accountant records but cannot lock; admin can lock", async () => {
      const accountant = { roles: ["accountant"], permissionOverrides: {} } as never;
      const admin = { roles: ["fms_admin"], permissionOverrides: {} } as never;
      assert.equal(canReconcile(accountant), true);
      assert.equal(canManageFiscalPeriods(accountant), false);
      assert.equal(canManageFiscalPeriods(admin), true);
    });
  });

  await t("override needs a real reason, only while something fails, and is stored", async () => {
    await A(async () => {
      assert.equal((await recordOverride(M, "", actor)).ok, false);
      assert.equal((await recordOverride(M, "short", actor)).ok, false);
      assert.equal((await recordOverride(M, 42, actor)).ok, false);
      assert.equal((await recordOverride("bad", "A proper long reason", actor)).ok, false);
      assert.equal((await listStepRecords(M)).override, null);
      assert.ok((await recordOverride(M, "Branch bank feed arrives late; CA approved", actor)).ok);
      const o = (await listStepRecords(M)).override!;
      assert.equal(o.reason, "Branch bank feed arrives late; CA approved");
      assert.equal(o.recordedByEmail, "fin@example.com");
      assert.ok(o.coveredKeys.length > 0);
      assert.ok((await getMonthClose(M)).override, "the page shows it");
      assert.ok((await db_audit()).some((a) => String(a.summary).includes("override recorded")), "audit-logged");
      assert.ok((await removeOverride(M, actor)).ok);
      assert.equal((await listStepRecords(M)).override, null);
    });
  });

  await t("lock: refused without a period, for a mismatched period, and before the month ends", async () => {
    await A(async () => {
      const m = "2024-03";
      let r = await lockMonth(m, actor);
      assert.equal(r.ok, false);
      assert.match(r.ok ? "" : r.error, /Fiscal Periods/);
      // a year-long period is not this month
      assert.ok((await createFiscalPeriod({ name: "FY 2024-25", startDate: new Date("2024-04-01T00:00:00"), endDate: new Date("2025-03-31T23:59:59") }, "u1")).ok);
      r = await lockMonth("2024-04", actor);
      assert.equal(r.ok, false);
      assert.match(r.ok ? "" : r.error, /does not match this month exactly/);
      // ongoing / future month: even with an exact period and an override, no lock
      const future = "2099-01";
      assert.ok((await createFiscalPeriod({ name: "P future", startDate: new Date("2099-01-01T00:00:00"), endDate: new Date("2099-01-31T23:59:59") }, "u1")).ok);
      r = await lockMonth(future, actor);
      assert.equal(r.ok, false);
      assert.match(r.ok ? "" : r.error, /not ended/);
      const cur = new Date().toISOString().slice(0, 7);
      assert.equal((await getMonthClose(cur)).decision.allowed, false, "the current month is never lockable");
      assert.equal((await listFiscalPeriods()).filter((p) => p.status === "closed").length, 0, "nothing was closed by the refusals");
    });
  });

  await t("lock: blocked while a data step fails, allowed with an override, calls the real closePeriod", async () => {
    await A(async () => {
      const m = "2024-03";
      assert.ok((await period(m)).ok);
      // payroll has no approved run for March -> failing; that blocks
      let r = await lockMonth(m, actor);
      assert.equal(r.ok, false);
      assert.equal((await getMonthClose(m)).decision.needsOverride, true);
      assert.equal((await listFiscalPeriods()).find((p) => p.name === "P 2024-03")!.status, "open");
      assert.equal((await recordOverride(m, "no", actor)).ok, false);
      assert.ok((await recordOverride(m, "No employees on payroll this month", actor)).ok);
      // a new failure after the override is not covered
      const db = await getDb();
      await db.collection("fms_transactions").insertOne({ _id: "late", transactionNumber: "late", type: "expense", status: "completed", amount: 3, description: null, accountId: null, transferId: null, transactionDate: new Date("2024-03-15T12:00:00Z"), ...stamp } as never);
      r = await lockMonth(m, actor);
      assert.equal(r.ok, false, "override does not cover the newly failing bank step");
      await db.collection("fms_transactions").updateOne({ _id: "late" } as never, { $set: { accountId: "acc" } });
      r = await lockMonth(m, actor);
      assert.ok(r.ok, r.ok ? "" : r.error);
      assert.equal(r.ok && r.overridden, true);
      assert.equal((await listFiscalPeriods()).find((p) => p.name === "P 2024-03")!.status, "closed");
      assert.ok((await db_audit()).some((a) => a.entity === "fiscal_period" && String(a.summary).includes("locked March 2024 with failing checks")), "override use audit-logged");
      assert.equal((await lockMonth(m, actor)).ok, false, "already locked");
      assert.equal((await recordStep(m, "depreciation_done", null, actor)).ok, false, "a locked month takes no more changes");
    });
  });

  await t("lock: a month where everything passes locks without any override", async () => {
    await A(async () => {
      const m = "2023-05";
      const db = await getDb();
      await db.collection("hrms_payroll_runs").insertOne({ _id: "run5", month: m, status: "paid", ...stamp } as never);
      assert.ok((await period(m)).ok);
      assert.ok((await getMonthClose(m)).blockingKeys.includes("cash_counted"), "the cash account still has no count in May");
      for (const acc of await listCashAccounts({ status: "active" })) await recordCashCount({ cashAccountId: acc._id, countDate: "2023-05-31", physicalCount: acc.currentBalance, notes: null }, "u1", null);
      const v = await getMonthClose(m);
      assert.deepEqual(v.blockingKeys, [], JSON.stringify(v.steps.filter((s) => s.status === "failing")));
      const r = await lockMonth(m, actor);
      assert.ok(r.ok && !r.overridden);
    });
  });

  await t("company isolation: another company sees none of it", async () => {
    await B(async () => {
      assert.equal((await listStepRecords(M)).records.length, 0);
      assert.equal((await listStepRecords(M)).override, null);
      assert.equal((await getMonthClose(M)).period.state, "none");
      assert.ok((await recordStep(M, "ageing_reviewed", "b's own", actor)).ok);
    });
    await A(async () => {
      assert.equal((await listStepRecords(M)).records.find((r) => r.stepKey === "ageing_reviewed")!.note !== "b's own", true);
    });
  });

  await t("accrual books on but unreadable is not passed", async () => {
    await runAsCompany("co_close_c", async () => {
      const db = await getDb();
      await db.collection("fms_accrual_settings").insertOne({ _id: "main", startDate: "2024-01-01", activatedAt: now, activatedBy: "u1", revenueAccountId: "x", expenseAccountId: "y", openingReceivable: 0, openingPayable: 0 } as never);
      const st = (await getMonthClose(M)).steps.find((s) => s.key === "accrual_in_ledger")!;
      assert.notEqual(st.status, "passed", st.detail);
    });
  });

  await t("a fiscal period saved without proper dates does not break the page, and a real one is still found", async () => {
    await A(async () => {
      const db = await getDb();
      const now = new Date();
      await db.collection("fms_fiscal_periods").insertMany([
        { _id: "damaged1", name: "No dates", status: "open", createdAt: now, updatedAt: now, deletedAt: null },
        { _id: "damaged2", name: "Text dates", startDate: "2027-02-01", endDate: "2027-02-28", status: "open", createdAt: now, updatedAt: now, deletedAt: null },
        { _id: "damaged3", name: "Broken", startDate: null, endDate: new Date("nonsense"), status: "open", createdAt: now, updatedAt: now, deletedAt: null },
      ] as never);
      const p = await getMonthClose("2027-02");
      assert.equal(p.period.state, "open", "the period with text dates is read as 1 to 28 February");
      const none = await getMonthClose("2027-05");
      assert.equal(none.period.state, "none");
      await db.collection("fms_fiscal_periods").deleteMany({ _id: { $in: ["damaged1", "damaged2", "damaged3"] as never[] } });
    });
  });

  console.log("month-close flow: all passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

async function db_audit() {
  const db = await getDb();
  return db.collection("fms_activity_logs").find({}).toArray() as Promise<{ entity: string; summary: string | null }[]>;
}
