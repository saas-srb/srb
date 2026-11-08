import assert from "node:assert/strict";
import { getDb } from "../src/lib/mongodb";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { upsertPayrollProfile } from "../src/lib/products/talentos/payroll";
import { approveRun, createRun, deleteRun, getPayslipsForRun, getRun, recomputeRun, setPayslipHold } from "../src/lib/products/talentos/payroll-run";
import { createAdjustment, listAdjustments } from "../src/lib/products/talentos/payroll-adjustments";
import { createLoan, getLoan } from "../src/lib/products/talentos/payroll-loans";
import { getPayrollConfig, updatePayrollConfig } from "../src/lib/products/talentos/payroll-config";
import { addDays, todayDateString } from "../src/lib/products/talentos/settings";
import { previewTax } from "../src/lib/products/talentos/tax-preview";
import { NO_DEDUCTIONS } from "../src/lib/products/talentos/payroll/tax";
import { NO_PREVIOUS_EMPLOYER } from "../src/lib/products/talentos/tax-declarations";
import { createBankAccount as createCompanyAccount, getBankAccount as getCompanyAccount } from "../src/lib/products/cashflow-ai/bank-accounts";
import { DEFAULT_CONTROLS, savePaymentControls } from "../src/lib/products/cashflow-ai/payment-controls";
import { recordTopUp } from "../src/lib/products/talentos/payroll-bank";
import { applyWebhookResult, initiatePayout, payoutsForRun } from "../src/lib/products/talentos/salary-payouts";
import { createBankAccount as createEmployeeBank } from "../src/lib/products/talentos/bank-accounts";
import { savePaymentAccount } from "../src/lib/platform/integrations/payments";
import { RAZORPAYX_ACCOUNT_NAME, applyPayoutEvent, listPayouts } from "../src/lib/products/cashflow-ai/payments/payouts";
import { listBankAccounts as listCompanyAccounts } from "../src/lib/products/cashflow-ai/bank-accounts";
import { deletePayment, duesForMonth, recordPayment, validatePayment } from "../src/lib/products/talentos/statutory-dues";
import { cancelRequest, createExpense, createOvertime, createShortLeave, decideRequest, listRequests } from "../src/lib/products/talentos/work-requests";

// Runs only against a throwaway database: set MONGODB_URI=mongodb://localhost:27017/zz_throwaway_<n>.
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const A = "co_pay_a", B = "co_pay_b", C = "co_pay_c";
const inC = <T>(fn: () => Promise<T>) => runAsCompany(C, fn);
const inA = <T>(fn: () => Promise<T>) => runAsCompany(A, fn);
const inB = <T>(fn: () => Promise<T>) => runAsCompany(B, fn);
const actor = "u_hr";
const M1 = "2026-08", M2 = "2026-09";

async function seedEmployee(id: string, code: string, first: string) {
  const db = await getDb();
  const now = new Date();
  await db.collection("hrms_employees").insertOne({
    _id: id, employeeCode: code, firstName: first, lastName: "Test", workEmail: `${first.toLowerCase()}@a.example`, status: "active",
    personal: { dateOfBirth: "1992-04-10", gender: "female", maritalStatus: null, personalEmail: null, phone: null, addressLine: null, city: null, state: "Maharashtra", postalCode: null, photoKey: null },
    professional: { departmentId: null, designationId: null, teamId: null, reportingManagerId: null, employmentType: "full_time", workLocation: null, joiningDate: "2025-01-01", probationEndDate: null, relievingDate: null },
    emergencyContacts: [], recruitment: null, adminUserId: null, createdAt: now, updatedAt: now, deletedAt: null, createdBy: actor, updatedBy: actor,
  } as never);
  await upsertPayrollProfile(id, { currency: "INR", basic: 30000, hra: 12000, allowances: [{ name: "Special allowance", amount: 18000 }], deductions: [], pfNumber: null, esiNumber: null, uan: "123456789012", panNumber: "ABCDE1234F" }, actor);
}

(async () => {
  const db = await getPlatformDb();
  assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await db.dropDatabase(); // every run starts clean (only ever a zz_throwaway_ database, checked above)

  await inA(async () => { await seedEmployee("e1", "E001", "Asha"); await seedEmployee("e2", "E002", "Ravi"); });
  let runId = "";

  await t("a run is created with a version 2 payslip for each employee", async () => {
    await inA(async () => {
      await createAdjustment({ employeeId: "e1", month: M1, category: "bonus", name: "Diwali bonus", amount: 10000, taxable: true, pf: false, esi: false, note: null }, actor);
      await createLoan({ employeeId: "e2", name: "Advance", principal: 6000, emi: 2000, startMonth: M1, note: null }, actor);
      const r = await createRun(M1, actor);
      assert.ok(r.ok, r.ok ? "" : r.error);
      if (!r.ok) return;
      runId = r.run._id;
      const slips = await getPayslipsForRun(runId);
      assert.equal(slips.length, 2);
      for (const s of slips as unknown as { schemaVersion: number; netPay: number; grossPay: number }[]) {
        assert.equal(s.schemaVersion, 2);
        assert.ok(s.netPay > 0 && s.netPay <= s.grossPay);
      }
    });
  });

  await t("the bonus is on Asha's payslip and the loan instalment on Ravi's", async () => {
    await inA(async () => {
      const slips = (await getPayslipsForRun(runId)) as unknown as { employeeId: string; earnings: { name: string; amount: number }[]; deductions: { name: string; amount: number }[] }[];
      assert.ok(slips.find((s) => s.employeeId === "e1")!.earnings.some((e) => e.name === "Diwali bonus" && e.amount === 10000));
      assert.ok(slips.find((s) => s.employeeId === "e2")!.deductions.some((d) => /advance/i.test(d.name) && d.amount === 2000));
    });
  });

  await t("a hold can be set and the run recomputes without losing it", async () => {
    await inA(async () => {
      const e2 = ((await getPayslipsForRun(runId)) as unknown as { _id: string; employeeId: string }[]).find((s) => s.employeeId === "e2")!;
      assert.ok((await setPayslipHold(e2._id, true, "documents pending")).ok);
      assert.ok((await recomputeRun(runId)).ok);
      const again = ((await getPayslipsForRun(runId)) as unknown as { employeeId: string; held?: boolean }[]).find((s) => s.employeeId === "e2")!;
      assert.equal(again.held, true);
    });
  });

  await t("approving books the bonus and the loan instalment, and deleting the run gives both back", async () => {
    await inA(async () => {
      let res = await approveRun(runId, actor);
      if (!res.ok) res = await approveRun(runId, actor, { acknowledgeWarnings: true });
      assert.ok(res.ok, res.error);
      assert.equal((await getRun(runId))!.status, "approved");
      assert.equal((await listAdjustments({ employeeId: "e1" }))[0].status, "applied");
      assert.equal((await getLoan((await (await getDb()).collection("hrms_payroll_loans").findOne({}))!._id as unknown as string))!.balance, 4000);
      assert.equal((await approveRun(runId, actor)).ok, false, "cannot approve twice");

      const del = await deleteRun(runId);
      assert.ok(del.ok, del.error);
      assert.equal((await listAdjustments({ employeeId: "e1" }))[0].status, "pending");
      assert.equal((await (await getDb()).collection("hrms_payroll_loans").findOne({}))!.balance, 6000);
    });
  });

  await t("the next month's run carries on from the first", async () => {
    await inA(async () => {
      const r1 = await createRun(M1, actor);
      assert.ok(r1.ok);
      if (!r1.ok) return;
      let a = await approveRun(r1.run._id, actor);
      if (!a.ok) a = await approveRun(r1.run._id, actor, { acknowledgeWarnings: true });
      assert.ok(a.ok, a.error);
      const r2 = await createRun(M2, actor);
      assert.ok(r2.ok, r2.ok ? "" : r2.error);
      assert.equal((await createRun(M2, actor)).ok, false, "one run per month");
    });
  });

  await t("another company sees none of this", async () => {
    await inB(async () => {
      assert.equal((await (await getDb()).collection("hrms_payroll_runs").countDocuments({})), 0);
      assert.equal((await listAdjustments()).length, 0);
    });
  });

  // ── Requests: overtime, partial leave, expense claims ──────────────────────────────────────────────────────────────
  const yesterday = addDays(todayDateString(), -1);
  const rm = yesterday.slice(0, 7);
  let workday = yesterday;
  while ([0, 6].includes(new Date(`${workday}T00:00:00Z`).getUTCDay())) workday = addDays(workday, -1);
  let rRun = "";
  const slipOf = async (id: string) => ((await getPayslipsForRun(id)) as unknown as { netPay: number; earnings: { name: string; amount: number }[]; daysNotes?: string[] }[])[0];

  await inC(async () => {
    await seedEmployee("r1", "R001", "Mira");
    const { _id, updatedAt, updatedBy, ...cfg } = await getPayrollConfig();
    void _id; void updatedAt; void updatedBy;
    await updatePayrollConfig({ ...cfg, overtimeEnabled: true, overtimeRequiresApproval: true } as never, actor);
  });

  await t("overtime is refused above the day's limit and does not pay until approved", async () => {
    await inC(async () => {
      const first = await createOvertime("r1", { date: workday, minutes: 120, reason: "Release night" }, "r1");
      assert.ok(first.ok, first.ok ? "" : first.error);
      const second = await createOvertime("r1", { date: workday, minutes: 180, reason: "More" }, "r1");
      assert.equal(second.ok, false);
      assert.equal((await createOvertime("r1", { date: addDays(todayDateString(), 3), minutes: 60, reason: "Future" }, "r1")).ok, false);
      const r = await createRun(workday.slice(0, 7), actor);
      assert.ok(r.ok, r.ok ? "" : r.error);
      if (!r.ok) return;
      rRun = r.run._id;
      assert.ok(!(await slipOf(rRun)).earnings.some((e) => e.name === "Overtime"), "pending overtime is not paid");
      assert.ok((await getRun(rRun))!.checks!.some((c) => c.code === "pending_overtime"), "the run flags the waiting request");
    });
  });

  await t("approving the overtime pays it on recompute", async () => {
    await inC(async () => {
      const req = (await listRequests({ employeeId: "r1", kind: "overtime" }))[0];
      const d = await decideRequest(req._id, "approved", null, "mgr");
      assert.ok(d.ok, d.ok ? "" : d.error);
      assert.ok((await recomputeRun(rRun)).ok);
      const slip = await slipOf(rRun);
      const ot = slip.earnings.find((e) => e.name === "Overtime");
      assert.ok(ot && ot.amount > 0, "overtime is on the payslip");
      assert.ok((slip.daysNotes ?? []).some((n) => n.includes("Overtime: 2 hour")));
      assert.ok(!(await getRun(rRun))!.checks!.some((c) => c.code === "pending_overtime"));
    });
  });

  await t("only two partial leaves a month", async () => {
    await inC(async () => {
      const a = await createShortLeave("r1", { date: workday, fromTime: "10:00", toTime: "11:00", reason: "Bank" }, "r1");
      const b = await createShortLeave("r1", { date: workday, fromTime: "15:00", toTime: "16:00", reason: "Doctor" }, "r1");
      assert.ok(a.ok && b.ok);
      const c3 = await createShortLeave("r1", { date: workday, fromTime: "16:30", toTime: "17:00", reason: "Third" }, "r1");
      assert.equal(c3.ok, false);
      if (!c3.ok) assert.ok(c3.error.includes("used your 2"), c3.error);
    });
  });

  await t("an approved expense is repaid as a reimbursement, once, and not twice for the same bill", async () => {
    await inC(async () => {
      const base = await slipOf(rRun);
      const input = { category: "subscription", title: "Design tool", vendor: "Acme Software", billNumber: "INV-9", billDate: addDays(todayDateString(), -3), amount: 3000, reason: "Client work" };
      const c1 = await createExpense("r1", input, "r1");
      assert.ok(c1.ok, c1.ok ? "" : c1.error);
      assert.equal((await createExpense("r1", input, "r1")).ok, false, "same bill twice");
      if (!c1.ok) return;
      assert.equal((await decideRequest(c1.request._id, "approved", null, "mgr", { approvedAmount: 4000, payMonth: rm })).ok, false, "more than claimed");
      const d = await decideRequest(c1.request._id, "approved", null, "mgr", { approvedAmount: 2500, payMonth: rm });
      assert.ok(d.ok, d.ok ? "" : d.error);
      assert.ok((await recomputeRun(rRun)).ok);
      const slip = await slipOf(rRun);
      const re = slip.earnings.find((e) => e.name === "Reimbursement: Design tool");
      assert.equal(re?.amount, 2500);
      assert.ok(slip.netPay >= base.netPay + 2500 - 1, "net pay rises by the amount");
      // Withdrawn before the run is approved: the reimbursement goes too.
      assert.ok((await cancelRequest(c1.request._id, "r1")).ok);
      assert.ok((await recomputeRun(rRun)).ok);
      assert.ok(!(await slipOf(rRun)).earnings.some((e) => e.name.startsWith("Reimbursement")));
    });
  });

  await t("once the month's run is approved, requests for it are closed", async () => {
    await inC(async () => {
      let a = await approveRun(rRun, actor);
      if (!a.ok) a = await approveRun(rRun, actor, { acknowledgeWarnings: true });
      assert.ok(a.ok, a.error);
      const ot = await createOvertime("r1", { date: workday, minutes: 30, reason: "Late" }, "r1");
      assert.equal(ot.ok, false);
      const approvedOt = (await listRequests({ employeeId: "r1", kind: "overtime", status: "approved" }))[0];
      assert.equal((await cancelRequest(approvedOt._id, "r1")).ok, false);
    });
  });

  await t("the tax preview compares both regimes using the real salary and caps what is claimed", async () => {
    await inC(async () => {
      const p = await previewTax("r1", { ...NO_DEDUCTIONS, section80C: 400000, section80DSelf: 90000 }, NO_PREVIOUS_EMPLOYER);
      assert.ok(p.ok, p.ok ? "" : p.error);
      if (!p.ok) return;
      const c80 = p.preview.old.deductions.find((d) => d.section === "80C");
      assert.ok(c80 && c80.amount <= p.preview.limits.section80C, "80C is capped at the limit");
      assert.equal(p.preview.headroom.section80C, 0);
      assert.ok(p.preview.new.deductions.every((d) => d.section === "80CCD(2)"), "the new regime allows no investment deductions");
      assert.ok(p.preview.old.yearTax <= p.preview.new.yearTax || p.preview.better === "new");
      assert.equal(p.preview.saving, Math.abs(p.preview.new.yearTax - p.preview.old.yearTax));
      const none = await previewTax("r1", NO_DEDUCTIONS, NO_PREVIOUS_EMPLOYER);
      assert.ok(none.ok && none.preview.headroom.section80C === none.preview.limits.section80C - none.preview.old.deductions.filter((d) => d.section === "80C").reduce((n, d) => n + d.amount, 0));
    });
  });

  let acct = "";
  const razorpay = { calls: [] as { path: string; body: Record<string, unknown> | null; key: string }[], seq: 0 };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = new URL(String(url));
    if (u.host !== "api.razorpay.com") return realFetch(url, init);
    const path = u.pathname.replace("/v1", "");
    razorpay.calls.push({ path, body: init.body ? JSON.parse(String(init.body)) : null, key: String((init.headers as Record<string, string>)?.["X-Payout-Idempotency"] ?? "") });
    const id = `${path.slice(1, 5)}_${++razorpay.seq}`;
    return new Response(JSON.stringify({ id, status: "processing" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const ledgerBalance = async (name: string) => (await listCompanyAccounts()).find((a) => a.accountName === name)?.currentBalance ?? 0;

  await t("salaries are paid through RazorpayX: nothing without a connection, one payout each with the amount in paise, books move when it is paid", async () => {
    await inC(async () => {
      const made = await createCompanyAccount({ accountName: "Test current account", bankName: "HDFC Bank", accountNumber: null, ifsc: "HDFC0000001", branch: null, currency: "INR", openingBalance: 1000000, status: "active", notes: null }, actor);
      assert.ok(made.ok);
      if (!made.ok) return;
      acct = made.account._id;
      const bank = await createEmployeeBank("r1", { accountHolderName: "Mira Test", bankName: "SBI", branch: null, accountType: "savings", accountNumber: "30000001234567", ifsc: "SBIN0000300", upiId: null, isPrimary: true }, { id: actor, email: "a@b.c" });
      assert.ok(bank.ok);
      if (!bank.ok) return;
      const db = await getDb();
      await db.collection("hrms_salary_payouts").updateMany({ runId: rRun }, { $set: { bankAccountId: bank.id, bankAccountLast4: "4567", bankName: "SBI", ifsc: "SBIN0000300" } });
      const payouts = await payoutsForRun(rRun);
      assert.ok(payouts.length > 0 && payouts.every((p) => p.status === "pending" && p.paymentProvider === "razorpay"), "payouts are Razorpay payouts from the start");

      const refused = await initiatePayout(payouts[0]._id, { id: actor, email: "a@b.c" });
      assert.equal(refused.ok, false, "not connected: nothing is paid");
      assert.equal(razorpay.calls.length, 0);

      await (await getPlatformDb()).collection("companies").updateOne({ _id: C as never }, { $set: { slug: "payc", name: "Pay C Co" } }, { upsert: true });
      const saved = await savePaymentAccount({ keyId: "rzp_test_abcdefgh12345", keySecret: "secretsecret", webhookSecret: "whsecret123", payoutsEnabled: true, accountNumber: "2323230000000000" }, { id: actor });
      assert.ok(saved.ok);

      // The money is added to RazorpayX from the current account: a transfer between the company's own accounts.
      const top = await recordTopUp({ fromAccountId: acct, amount: 200000, date: todayDateString(), reference: "NEFT-TOPUP-1" }, { id: actor, email: "a@b.c" });
      assert.ok(top.ok, top.ok ? "" : top.error);
      assert.equal(await ledgerBalance("Test current account"), 800000);
      assert.equal(await ledgerBalance(RAZORPAYX_ACCOUNT_NAME), 200000);

      // Rules of the company: freshly entered bank details wait, and only so much in salaries goes out in a day.
      await savePaymentControls({ ...DEFAULT_CONTROLS, payeeHoldHours: 24 }, actor);
      const held = await initiatePayout(payouts[0]._id, { id: actor, email: "a@b.c" });
      assert.equal(held.ok, false, "a new bank account waits");
      assert.ok(!held.ok && /changed recently/.test(held.error ?? ""));
      await savePaymentControls({ ...DEFAULT_CONTROLS, payeeHoldHours: 0, salaryDailyMax: 1000 }, actor);
      const capped = await initiatePayout(payouts[0]._id, { id: actor, email: "a@b.c" });
      assert.equal(capped.ok, false, "over the day's salary limit");
      assert.ok(!capped.ok && /daily limit/.test(capped.error ?? ""));
      assert.equal(razorpay.calls.filter((c) => c.path === "/payouts").length, 0, "nothing was sent either time");
      await savePaymentControls({ ...DEFAULT_CONTROLS, payeeHoldHours: 0 }, actor);

      const started = await initiatePayout(payouts[0]._id, { id: actor, email: "a@b.c" });
      assert.ok(started.ok, started.ok ? "" : started.error);
      const po = razorpay.calls.filter((c) => c.path === "/payouts").at(-1)!;
      assert.equal(po.key, payouts[0]._id, "the payout id is the idempotency key");
      assert.equal(po.body!.amount, Math.round(payouts[0].paymentAmount * 100), "amount in paise");
      assert.equal(po.body!.purpose, "salary");
      const processing = (await payoutsForRun(rRun))[0];
      assert.equal(processing.status, "processing");
      assert.equal(await ledgerBalance(RAZORPAYX_ACCOUNT_NAME), 200000, "nothing is booked until RazorpayX pays");

      assert.ok(await applyWebhookResult({ providerPayoutId: processing.providerPayoutId!, status: "paid", utr: "UTR000111222" }));
      const paid = (await payoutsForRun(rRun))[0];
      assert.equal(paid.status, "paid");
      assert.equal(paid.utr, "UTR000111222");
      assert.equal(await ledgerBalance(RAZORPAYX_ACCOUNT_NAME), 200000 - paid.paymentAmount, "the salary comes out of the RazorpayX balance once");
      assert.equal((await getRun(rRun))!.status, "paid", "every salary paid, so the run is paid");
      await applyWebhookResult({ providerPayoutId: processing.providerPayoutId!, status: "paid", utr: "UTR000111222" });
      assert.equal(await ledgerBalance(RAZORPAYX_ACCOUNT_NAME), 200000 - paid.paymentAmount, "a repeated webhook does not post twice");

      // The bank sends it back: the payout fails and the books are put right.
      await applyWebhookResult({ providerPayoutId: processing.providerPayoutId!, status: "reversed", failureReason: "Account closed" });
      assert.equal((await payoutsForRun(rRun))[0].status, "failed");
      assert.equal(await ledgerBalance(RAZORPAYX_ACCOUNT_NAME), 200000);
      assert.equal((await getRun(rRun))!.status, "approved");
    });
  });

  await t("an approved expense claim can be paid straight away through Razorpay, and is not also paid with salary", async () => {
    await inC(async () => {
      const claim = await createExpense("r1", { category: "travel", title: "Client taxi", vendor: "City Cabs", billNumber: "CAB-77", billDate: addDays(todayDateString(), -2), amount: 1800, reason: "Client visit" }, "r1");
      assert.ok(claim.ok, claim.ok ? "" : claim.error);
      if (!claim.ok) return;
      const before = razorpay.calls.filter((c) => c.path === "/payouts").length;
      const d = await decideRequest(claim.request._id, "approved", null, "mgr", { approvedAmount: 1500, payNow: true });
      assert.ok(d.ok, d.ok ? "" : d.error);
      assert.equal(razorpay.calls.filter((c) => c.path === "/payouts").length, before + 1, "one payout was sent");
      assert.equal(razorpay.calls.filter((c) => c.path === "/payouts").at(-1)!.body!.amount, 150000);
      assert.equal((await (await getDb()).collection("hrms_payroll_adjustments").countDocuments({ requestId: claim.request._id })), 0, "no reimbursement is added to salary as well");
      assert.equal((await cancelRequest(claim.request._id, "r1")).ok, false, "a claim already sent for payment cannot be withdrawn");
      const p = (await listPayouts()).find((x) => x.sourceRecordId === claim.request._id)!;
      await applyPayoutEvent({ providerPayoutId: p.providerPayoutId!, status: "paid", utr: "UTR121212121" });
      const paid = (await (await getDb()).collection("hrms_work_requests").findOne({ _id: claim.request._id as never }))!;
      assert.equal(paid.paidUtr, "UTR121212121");
      assert.ok(paid.paidAt);
    });
  });

  await t("government dues come from the approved run, and payments are checked against what is owed", async () => {
    await inC(async () => {
      const d = await duesForMonth(rm);
      assert.ok(d, "the approved run has dues");
      if (!d) return;
      const pf = d.dues.find((x) => x.kind === "pf")!;
      assert.ok(pf.amount > 0 && pf.status !== "paid");
      assert.ok(pf.dueDate && pf.dueDate.endsWith("-15"));
      const bad = validatePayment({ month: rm, kind: "tds", amount: 100, paidOn: todayDateString(), reference: "CIN1234", accountId: acct });
      assert.equal(bad.valid, false, "a tax challan needs the BSR code and serial");
      assert.equal(validatePayment({ month: rm, kind: "pf", amount: 100, paidOn: todayDateString(), reference: "TRRN-9" }).valid, false, "a payment must name the company account");
      const tooMuch = await recordPayment({ month: rm, kind: "pf", state: null, amount: pf.amount + 500, paidOn: todayDateString(), reference: "TRRN-1", bsrCode: null, challanSerial: null, note: null, accountId: acct }, actor);
      assert.equal(tooMuch.ok, false);
      const first = await recordPayment({ month: rm, kind: "pf", state: null, amount: pf.amount, paidOn: todayDateString(), reference: "TRRN-1", bsrCode: null, challanSerial: null, note: null, accountId: acct }, actor);
      assert.ok(first.ok);
      assert.equal((await getCompanyAccount(acct))!.currentBalance, 800000 - pf.amount, "the PF payment comes out of the company account");
      assert.equal((await recordPayment({ month: rm, kind: "pf", state: null, amount: 1, paidOn: todayDateString(), reference: "TRRN-1", bsrCode: null, challanSerial: null, note: null, accountId: acct }, actor)).ok, false);
      assert.equal((await duesForMonth(rm))!.dues.find((x) => x.kind === "pf")!.status, "paid");
      if (first.ok) assert.ok((await deletePayment(first.id)).ok);
      assert.equal((await getCompanyAccount(acct))!.currentBalance, 800000, "removing the payment gives the balance back");
      assert.notEqual((await duesForMonth(rm))!.dues.find((x) => x.kind === "pf")!.status, "paid");
    });
  });

  console.log("payroll run tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
