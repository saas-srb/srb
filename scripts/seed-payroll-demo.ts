/**
 * Fills ONE company with a payroll test bed, so every part of payroll can be checked by hand: eight employees who each exercise a different
 * rule, last month's attendance and an approved payroll run, this month's pending items, requests, declarations and a leaver.
 *
 *   npm run seed:payroll -- --company <slug>                # replaces any earlier payroll test data in that company
 *   npm run seed:payroll -- --company <slug> --reset-only   # removes it again
 *   npm run seed:payroll -- --company <slug> --login        # also gives "Riya" a portal login and prints its password
 *   npm run seed:payroll -- --company <slug> --razorpay     # also connects Razorpay TEST keys for salary payouts (see below)
 *
 * --razorpay reads SEED_RZP_KEY_ID (must be rzp_test_…: a live key is refused), SEED_RZP_KEY_SECRET, SEED_RZP_ACCOUNT_NUMBER (the RazorpayX
 * account number) and, optionally, SEED_RZP_WEBHOOK_SECRET from the environment, saves them for the company with salary payouts switched on,
 * and tests the connection. --reset-only disconnects it again.
 *
 * Refuses the platform operator company, and any company that already has real employees (a payroll run covers everybody, and the reset
 * deletes the company's payroll runs). Use a test company registered at /signup. Writes through the company-scoped database only.
 */
import { randomBytes } from "node:crypto";
import type { ObjectId } from "mongodb";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getDb } from "@/lib/mongodb";
import { createStamp } from "@/lib/products/talentos/db";
import { addDays, monthBounds, todayDateString, eachDateString, classifyDay, getOrgSettings } from "@/lib/products/talentos/settings";
import { getPayrollConfig, updatePayrollConfig, setSalaryAccount, PAYROLL_CONFIG_COLLECTION } from "@/lib/products/talentos/payroll-config";
import { upsertPayrollProfile, DEFAULT_STATUTORY, type PayComponent } from "@/lib/products/talentos/payroll";
import { createBankAccount } from "@/lib/products/talentos/bank-accounts";
import { isEncryptionConfigured } from "@/lib/products/talentos/crypto";
import { createHoliday } from "@/lib/products/talentos/holidays";
import { createAdjustment } from "@/lib/products/talentos/payroll-adjustments";
import { createLoan } from "@/lib/products/talentos/payroll-loans";
import { saveSettlement } from "@/lib/products/talentos/payroll-settlements";
import { saveDeclaration, verifyDeclaration, NO_PREVIOUS_EMPLOYER } from "@/lib/products/talentos/tax-declarations";
import { financialYearOf, monthsOfFy } from "@/lib/products/talentos/payroll/rates";
import { NO_DEDUCTIONS } from "@/lib/products/talentos/payroll/tax";
import { createExpense, createOvertime, createShortLeave, decideRequest } from "@/lib/products/talentos/work-requests";
import { createRun, approveRun } from "@/lib/products/talentos/payroll-run";
import { duesForMonth, recordPayment } from "@/lib/products/talentos/statutory-dues";
import { createBankAccount as createCompanyAccount } from "@/lib/products/cashflow-ai/bank-accounts";
import { createEmployeeLogin } from "@/lib/products/talentos/employee-auth";
import { disconnectPaymentAccount, paymentWebhookPaths, savePaymentAccount, testPaymentAccount } from "@/lib/platform/integrations/payments";

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined; };
const has = (n: string) => args.includes(`--${n}`);
const fail = (m: string): never => { console.error(`✗ ${m}`); process.exit(1); };

const P = "seed_pay_";
const actor = "seed_pay_script";
const actorUser = { id: actor, email: "seed@payroll.test" };
const log = (s: string) => console.log(s);

interface Person {
  key: string; first: string; last: string; gender: "female" | "male"; dob: string; state: string; join: string; basic: number; da?: number; hra: number;
  allowances: PayComponent[]; uan: string | null; pan: string | null; bank: boolean; note: string; manager?: string;
}
const monthsAgo = (n: number) => { const [y, m] = todayDateString().slice(0, 7).split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 - n, 1)); return d.toISOString().slice(0, 7); };
const yearsAgo = (n: number) => `${Number(todayDateString().slice(0, 4)) - n}-02-10`;

const cur = todayDateString().slice(0, 7);
const prev = monthsAgo(1);
const prevFrom = `${prev}-01`;

const PEOPLE: Person[] = [
  { key: "e1", first: "Riya", last: "Sharma", gender: "female", dob: "1991-06-12", state: "Maharashtra", join: yearsAgo(3), basic: 60000, hra: 24000, allowances: [{ name: "Special allowance", amount: 36000 }], uan: "100200300401", pan: "ABCPS1234A", bank: true, note: "₹1,20,000 a month: income tax (TDS), PT, an approved bonus and approved overtime", manager: "e8" },
  { key: "e2", first: "Karan", last: "Mehta", gender: "male", dob: "1988-11-03", state: "Karnataka", join: yearsAgo(4), basic: 30000, hra: 12000, allowances: [{ name: "Special allowance", amount: 18000 }], uan: "100200300402", pan: "ABCPM2345B", bank: true, note: "Old-regime declaration with rent, 2 absent days, a half-day and late marks, partial leave", manager: "e8" },
  { key: "e3", first: "Sana", last: "Khan", gender: "female", dob: "1997-02-20", state: "Maharashtra", join: yearsAgo(1), basic: 10000, hra: 4000, allowances: [{ name: "Conveyance", amount: 3000 }], uan: "100200300403", pan: "ABCPK3456C", bank: true, note: "₹17,000 a month: ESI applies; a salary advance being recovered", manager: "e8" },
  { key: "e4", first: "Vikram", last: "Singh", gender: "male", dob: "1994-08-30", state: "West Bengal", join: `${prev}-12`, basic: 25000, hra: 10000, allowances: [{ name: "Special allowance", amount: 15000 }], uan: "100200300404", pan: "ABCPS4567D", bank: true, note: "Joined mid-last-month (part-month pay); previous employer's tax declared" },
  { key: "e5", first: "Neha", last: "Iyer", gender: "female", dob: "1985-04-18", state: "Maharashtra", join: yearsAgo(6), basic: 40000, da: 5000, hra: 16000, allowances: [{ name: "Special allowance", amount: 24000 }], uan: "100200300405", pan: "ABCPI5678E", bank: true, note: "Has DA; new regime; plain month", manager: "e8" },
  { key: "e6", first: "Arjun", last: "Rao", gender: "male", dob: "1982-01-09", state: "Maharashtra", join: yearsAgo(7), basic: 45000, hra: 18000, allowances: [{ name: "Special allowance", amount: 27000 }], uan: "100200300406", pan: "ABCPR6789F", bank: true, note: "Leaving at the end of this month: full and final settlement with gratuity, leave encashment, notice recovery and a loan balance", manager: "e8" },
  { key: "e7", first: "Pooja", last: "Das", gender: "female", dob: "1999-09-25", state: "Maharashtra", join: yearsAgo(1), basic: 22000, hra: 8000, allowances: [], uan: null, pan: null, bank: false, note: "No UAN, PAN or bank account, and three days with no attendance: shows the warnings", manager: "e8" },
  { key: "e8", first: "Amit", last: "Kulkarni", gender: "male", dob: "1979-12-01", state: "Maharashtra", join: yearsAgo(9), basic: 70000, hra: 28000, allowances: [{ name: "Special allowance", amount: 42000 }], uan: "100200300408", pan: "ABCPK8901H", bank: true, note: "Manager of most of the team" },
];

async function wipe(ids: string[]) {
  const db = await getDb();
  const byEmp = { employeeId: { $in: ids } };
  for (const c of ["hrms_payroll_profiles", "hrms_bank_accounts", "hrms_attendance", "hrms_payroll_adjustments", "hrms_payroll_loans", "hrms_payroll_settlements", "hrms_tax_declarations", "hrms_work_requests", "hrms_leave_requests", "hrms_salary_revisions", "hrms_leave_balances"]) await db.collection(c).deleteMany(byEmp);
  for (const c of ["hrms_salary_payouts", "hrms_payslips", "hrms_payroll_runs", "hrms_statutory_payments", "hrms_payroll_bank_batches"]) await db.collection(c).deleteMany({});
  // The ledger entries payroll posted to the test company account, and the account itself.
  const txns = await db.collection("fms_transactions").find({ sourceModule: "hrms" }, { projection: { _id: 1 } }).toArray();
  const txnIds = txns.map((t) => String(t._id));
  if (txnIds.length) {
    const entries = await db.collection("fms_journal_entries").find({ transactionId: { $in: txnIds } }, { projection: { _id: 1 } }).toArray();
    await db.collection("fms_journal_lines").deleteMany({ entryId: { $in: entries.map((e) => String(e._id)) } });
    await db.collection("fms_journal_entries").deleteMany({ transactionId: { $in: txnIds } });
    await db.collection("fms_transactions").deleteMany({ _id: { $in: txnIds } as never });
  }
  await db.collection("fms_bank_accounts").deleteMany({ accountName: "Seed Current Account" });
  await db.collection("hrms_holidays").deleteMany({ name: /^Seed / });
  await db.collection("admin_users").deleteMany({ employeeId: { $in: ids } });
  await db.collection("hrms_employees").deleteMany({ _id: { $in: ids } as never });
}

async function main() {
  const platform = await getPlatformDb();
  const slug = flag("company")?.trim().toLowerCase();
  if (!slug) fail("Pass --company <slug> (a test company, registered at /signup).");
  const company = await platform.collection("companies").findOne({ slug });
  if (!company) fail(`No company with slug "${slug}".`);
  if (company!.isPlatformOwner) fail("That is the platform operator company. Use a customer (test) company.");
  const companyId = String(company!._id);
  const rzp = { keyId: process.env.SEED_RZP_KEY_ID?.trim() ?? "", keySecret: process.env.SEED_RZP_KEY_SECRET?.trim() ?? "", accountNumber: process.env.SEED_RZP_ACCOUNT_NUMBER?.trim() ?? "", webhookSecret: process.env.SEED_RZP_WEBHOOK_SECRET?.trim() ?? "" };
  if (has("razorpay") && !has("reset-only")) {
    if (!/^rzp_test_/.test(rzp.keyId)) fail("--razorpay needs SEED_RZP_KEY_ID to be a TEST key (rzp_test_…). A live key is never saved by this script.");
    if (!rzp.keySecret || !rzp.accountNumber) fail("--razorpay needs SEED_RZP_KEY_SECRET and SEED_RZP_ACCOUNT_NUMBER (the RazorpayX account number from the RazorpayX test dashboard).");
  }
  console.log(`🌱 Payroll test data → "${company!.name}" (${slug}) in database "${platform.databaseName}"\n`);

  await runAsCompany(companyId, async () => {
    const db = await getDb();
    const ids = PEOPLE.map((p) => P + p.key);
    const real = await db.collection("hrms_employees").countDocuments({ _id: { $nin: ids } as never });
    if (real > 0) fail(`This company has ${real} employee(s) that are not test data. A payroll run covers everybody and the reset deletes payroll runs, so use an empty test company.`);

    // Put back what an earlier seeding changed.
    const metaId = `${P}backup`;
    const backup = await db.collection<{ _id: string; config?: Record<string, unknown>; stateSet?: boolean; razorpay?: boolean }>("hrms_meta").findOne({ _id: metaId });
    if (backup?.config) await db.collection(PAYROLL_CONFIG_COLLECTION).replaceOne({ _id: "org" as never }, backup.config as never, { upsert: true });
    if (backup?.stateSet) await db.collection("hrms_settings").updateOne({}, { $set: { state: null } });
    if (backup?.razorpay) {
      await disconnectPaymentAccount(actorUser);
      log("• Razorpay test keys disconnected");
    }
    await wipe(ids);
    await db.collection("hrms_meta").deleteOne({ _id: metaId as never });
    log("• cleared earlier payroll test data");
    if (has("reset-only")) return log("\nDone: test data removed and the company's payroll settings put back.");

    // Settings the scenarios need.
    const before = await getPayrollConfig();
    const settings = await getOrgSettings();
    const useRazorpay = has("razorpay");
    await db.collection("hrms_meta").insertOne({ _id: metaId, config: before, stateSet: !settings.state, razorpay: useRazorpay } as never);
    if (!settings.state) await db.collection("hrms_settings").updateOne({ _id: settings._id as never }, { $set: { state: "Maharashtra" } }, { upsert: true });
    const { _id: _a, updatedAt: _b, updatedBy: _c, ...cfg } = before;
    void _a; void _b; void _c;
    await updatePayrollConfig({ ...cfg, pfRegistered: true, esiRegistered: true, ptRegistered: true, tdsEnabled: true, overtimeEnabled: true, overtimeRequiresApproval: true, lateMarksPerHalfDay: 3, unmarkedDay: "lop", shortLeavesPerMonth: 2 } as never, actor);
    log("• payroll settings: PF, ESI, PT, TDS on; overtime on (approved only); 3 late marks = half a day (your earlier settings are restored by --reset-only)");

    // The company's own current account: what salaries and government dues are paid from.
    const acct = await createCompanyAccount({ accountName: "Seed Current Account", bankName: "HDFC Bank", accountNumber: isEncryptionConfigured() ? "50200012345678" : null, ifsc: "HDFC0000001", branch: null, currency: "INR", openingBalance: 5000000, status: "active", notes: "Payroll test data" }, actor);
    if (!acct.ok) fail(`Could not create the company account: ${acct.reason}`);
    else await setSalaryAccount(acct.account._id, actor);
    log("• company current account \"Seed Current Account\" (₹50,00,000 in the books) set as the salary account");

    // People.
    const now = new Date();
    const exitDate = monthBounds(cur).to;
    let banks = 0;
    for (const p of PEOPLE) {
      const id = P + p.key;
      await db.collection("hrms_employees").insertOne({
        _id: id, employeeCode: `SEED-${p.key.slice(1).padStart(2, "0")}`, firstName: p.first, lastName: p.last, workEmail: `${p.first.toLowerCase()}.seed@payroll.test`, status: "active",
        personal: { dateOfBirth: p.dob, gender: p.gender, maritalStatus: null, personalEmail: null, phone: null, addressLine: null, city: null, state: p.state, postalCode: null, photoKey: null },
        professional: { departmentId: null, designationId: null, teamId: null, reportingManagerId: p.manager ? P + p.manager : null, employmentType: "full_time", workLocation: p.state, joiningDate: p.join, probationEndDate: null, relievingDate: p.key === "e6" ? exitDate : null },
        emergencyContacts: [], recruitment: null, adminUserId: null, createdAt: now, updatedAt: now, deletedAt: null, createdBy: actor, updatedBy: actor,
      } as never);
      await upsertPayrollProfile(id, {
        currency: "INR", basic: p.basic, da: p.da ?? 0, hra: p.hra, allowances: p.allowances, deductions: [], pfNumber: null, esiNumber: p.key === "e3" ? "3100012345" : null, uan: p.uan, panNumber: p.pan,
        statutory: { ...DEFAULT_STATUTORY, workState: p.state },
      }, actor);
      if (p.bank) {
        if (isEncryptionConfigured()) {
          try {
            await createBankAccount(id, { accountHolderName: `${p.first} ${p.last}`, bankName: "State Bank of India", branch: "Main", accountType: "savings", accountNumber: `3000000${p.key.slice(1)}00123`, ifsc: "SBIN0000300", upiId: null, isPrimary: true }, actorUser);
            banks++;
            // Test data is not a fresh change of bank details: back-date it so the 24-hour cooling-off does not hold the test payments.
            await db.collection("hrms_bank_accounts").updateMany({ employeeId: id }, { $set: { detailsChangedAt: new Date(Date.now() - 72 * 3_600_000) } });
          } catch (err) {
            fail(`Could not save a bank account: ${err instanceof Error ? err.message : err}. PLATFORM_ENCRYPTION_KEY must be a base64 32-byte key (openssl rand -base64 32).`);
          }
        }
      }
    }
    if (!isEncryptionConfigured()) log("  ! no encryption key is set, so no bank accounts were saved and every payslip will warn about a missing bank account. Set PLATFORM_ENCRYPTION_KEY in .env.local and run this again.");
    log(`• ${PEOPLE.length} employees with salary structures${banks ? ` and ${banks} test bank accounts (savings, IFSC SBIN0000300; change them if Razorpay rejects the IFSC)` : ""}`);

    if (useRazorpay) {
      const saved = await savePaymentAccount({ ...rzp, payoutsEnabled: true }, actorUser);
      if (!saved.ok) fail(`Razorpay was not saved: ${saved.error} ${Object.values(saved.errors ?? {}).join(" ")}`);
      const tested = await testPaymentAccount();
      log(tested.ok ? `• Razorpay test keys saved, payouts on. ${tested.message}` : `  ! Razorpay keys saved but the connection test failed: ${tested.error}`);
    }

    // A holiday observed only in Maharashtra.
    let holiday = addDays(prevFrom, 19);
    while ([0, 6].includes(new Date(`${holiday}T00:00:00Z`).getUTCDay())) holiday = addDays(holiday, 1);
    await createHoliday({ date: holiday, name: "Seed state holiday (Maharashtra only)", type: "public", states: ["Maharashtra"] }, actor);

    // Attendance for last month and this month so far.
    const org = await getOrgSettings();
    const mh = new Set([holiday]);
    const att: Record<string, unknown>[] = [];
    const rec = (empId: string, date: string, status: "present" | "absent" | "half_day", extra: { late?: boolean; minutes?: number } = {}) =>
      att.push({ _id: `${P}att_${empId}_${date}`, employeeId: empId, date, status, checkIn: status === "absent" ? null : extra.late ? "09:55" : "09:30", checkOut: status === "absent" ? null : "18:30", breakMinutes: 60, workedMinutes: status === "absent" ? 0 : status === "half_day" ? 240 : (extra.minutes ?? 480), isLate: !!extra.late, lateByMinutes: extra.late ? 25 : 0, isEarlyDeparture: false, earlyByMinutes: 0, source: "manual", leaveRequestId: null, note: null, ...createStamp(actor) });
    for (const [month, upTo] of [[prev, monthBounds(prev).to], [cur, addDays(todayDateString(), 0)]] as const) {
      const days = eachDateString(`${month}-01`, upTo).filter((d) => classifyDay(d, org, new Set()) === "working");
      for (const p of PEOPLE) {
        const id = P + p.key;
        const mine = days.filter((d) => d >= p.join && !(p.state === "Maharashtra" && mh.has(d)));
        mine.forEach((d, i) => {
          if (month === prev) {
            if (p.key === "e2" && (i === 3 || i === 9)) return rec(id, d, "absent");
            if (p.key === "e2" && i === 14) return rec(id, d, "half_day");
            if (p.key === "e2" && [1, 5, 11].includes(i)) return rec(id, d, "present", { late: true });
            if (p.key === "e3" && i === 6) return rec(id, d, "absent");
            if (p.key === "e7" && i >= mine.length - 3) return;
            if (p.key === "e1" && [4, 10].includes(i)) return rec(id, d, "present", { minutes: 660 });
          } else if (p.key === "e2" && i === 2) return rec(id, d, "absent");
          rec(id, d, "present");
        });
      }
    }
    await db.collection("hrms_attendance").insertMany(att as never[]);
    log(`• ${att.length} attendance records (last month and this month so far); one holiday only in Maharashtra`);

    // Things that must exist before last month's run.
    const e = (k: string) => P + k;
    await createAdjustment({ employeeId: e("e1"), month: prev, category: "bonus", name: "Performance bonus", amount: 10000, taxable: true, pf: false, esi: false, note: "Seed" }, actor);
    await createLoan({ employeeId: e("e3"), name: "Salary advance", principal: 6000, emi: 2000, startMonth: prev, note: "Seed" }, actor);
    await createLoan({ employeeId: e("e6"), name: "Festival advance", principal: 12000, emi: 2000, startMonth: prev, note: "Seed" }, actor);
    const workday = eachDateString(prevFrom, monthBounds(prev).to).filter((d) => classifyDay(d, org, new Set()) === "working").at(-2)!;
    const canOvertime = addDays(todayDateString(), -45) <= workday;
    if (canOvertime) {
      const ot = await createOvertime(e("e1"), { date: workday, minutes: 150, reason: "Month-end release" }, e("e1"));
      if (ot.ok) await decideRequest(ot.request._id, "approved", "Seed", actor);
    } else log("  ! last month is more than 45 days back, so the approved-overtime example was skipped");
    // Declarations. The company's payroll "starts" last month, so earlier months of the financial year are entered as an opening balance under
    // "previous employer", the way a real company moving to this system mid-year must do (otherwise the year's tax comes out too low).
    const fy = financialYearOf(prev);
    const earlier = monthsOfFy(fy).filter((m) => m < prev);
    for (const p of PEOPLE) {
      const n = earlier.filter((m) => m >= p.join.slice(0, 7)).length;
      const gross = p.basic + (p.da ?? 0) + p.hra + p.allowances.reduce((x, a) => x + a.amount, 0);
      const opening = p.key === "e4"
        ? { employerName: "Previous Employer Pvt Ltd", taxableSalary: 180000, employeePf: 10800, professionalTax: 1400, tds: 4000 }
        : n > 0
          ? { employerName: "Opening balance: earlier months of this year", taxableSalary: gross * n, employeePf: Math.round(Math.min(p.basic + (p.da ?? 0), 15000) * 0.12) * n, professionalTax: 200 * n, tds: 0 }
          : NO_PREVIOUS_EMPLOYER;
      const old = p.key === "e2";
      const amounts = old ? { ...NO_DEDUCTIONS, section80C: 150000, section80DSelf: 25000, rentPaidAnnual: 240000 } : NO_DEDUCTIONS;
      const r = await saveDeclaration(P + p.key, fy, { regime: old ? "old" : "new", declared: amounts, previousEmployer: opening, landlordPan: old ? "AAAPL1234C" : null, submit: true }, actor);
      if (r.ok && p.key === "e1") await verifyDeclaration(r.declaration._id, amounts, "Seed", actor);
    }

    // Last month's run, approved, with the government payment for provident fund already made.
    const run = await createRun(prev, actor);
    if (!run.ok) fail(`Could not create last month's run: ${run.error}`);
    else {
      let a = await approveRun(run.run._id, actor);
      if (!a.ok) a = await approveRun(run.run._id, actor, { acknowledgeWarnings: true });
      if (!a.ok) fail(`Could not approve last month's run: ${a.error}`);
      log(`• ${prev} run created and approved (${run.run.payslipCount} payslips)`);
      const d = await duesForMonth(prev);
      const pf = d?.dues.find((x) => x.kind === "pf");
      if (pf && pf.amount > 0) await recordPayment({ month: prev, kind: "pf", state: null, amount: pf.amount, paidOn: todayDateString(), reference: "SEED-TRRN-0001", bsrCode: null, challanSerial: null, note: "Seed", accountId: acct.ok ? acct.account._id : "" }, actor);
      log("• provident fund for that month recorded as paid; ESI, TDS and PT left unpaid so the dues page has something to show");
    }

    // This month: nothing run yet; items waiting.
    await createAdjustment({ employeeId: e("e8"), month: cur, category: "incentive", name: "Quarterly incentive", amount: 5000, taxable: true, pf: false, esi: false, note: "Seed" }, actor);
    await createAdjustment({ employeeId: e("e2"), month: cur, category: "recovery", name: "Training bond recovery", amount: 1500, taxable: false, pf: false, esi: false, note: "Seed" }, actor);
    await saveSettlement({ employeeId: e("e6"), reason: "resignation", exitDate, leaveDaysToEncash: 6, noticeShortfallDays: 5, otherEarnings: [], otherRecoveries: [{ name: "Laptop damage", amount: 3000 }], payGratuity: true, fixedTerm: false, note: "Seed" }, actor);
    const yesterday = addDays(todayDateString(), -1);
    const today = todayDateString();
    const reqs = [
      await createOvertime(e("e1"), { date: yesterday >= `${cur}-01` ? yesterday : today, minutes: 120, reason: "Client deadline" }, e("e1")),
      await createShortLeave(e("e2"), { date: today, fromTime: "15:00", toTime: "17:00", reason: "Bank work" }, e("e2")),
      await createExpense(e("e3"), { category: "subscription", title: "Design software", vendor: "Acme Software", billNumber: "SEED-INV-101", billDate: addDays(today, -5), amount: 3500, reason: "Needed for client work" }, e("e3")),
      await createExpense(e("e7"), { category: "travel", title: "Taxi to client site", vendor: "City Cabs", billNumber: "SEED-CAB-7", billDate: addDays(today, -4), amount: 900, reason: "Client visit" }, e("e7")),
    ];
    const ok = await createExpense(e("e1"), { category: "internet_phone", title: "Broadband for work", vendor: "FastNet", billNumber: "SEED-NET-22", billDate: addDays(today, -8), amount: 2400, reason: "Work from home" }, e("e1"));
    if (ok.ok) await decideRequest(ok.request._id, "approved", null, actor, { approvedAmount: 2200, payMonth: cur });
    const no = reqs[3];
    if (no.ok) await decideRequest(no.request._id, "rejected", "Bill is not for a work trip", actor);
    log(`• this month: 2 pending items, a settlement for the leaver, ${reqs.filter((r) => r.ok).length + 1} requests (some pending, one approved, one rejected)`);

    if (has("login")) {
      const password = `Seed-${randomBytes(5).toString("hex")}-Aa1`;
      const r = await createEmployeeLogin(e("e1"), "riya.seed@payroll.test", password);
      log(r.ok ? `• portal login for Riya: riya.seed@payroll.test / ${password}  (asks for a new password at first sign-in)` : `  ! no login created: ${r.error}`);
    }
  });

  if (has("reset-only")) return;
  console.log(`
Done. Where to look (sign in as the company's owner or HR):
  Payroll                      this month has no run yet: create it, read the checks, recompute, hold a salary, approve
  Payroll → ${prev}            the approved run: payslips, downloads (ECR, ESI, PT, TDS, register, journal). Pay the salaries with Razorpay (needs Razorpay connected,
                               see --razorpay); each paid salary is booked against the RazorpayX balance in CashFlow
  Payroll → Government payments  PF paid, the rest due (or overdue), with TDS interest and the returns calendar
  Payroll → Company bank account  the test current account salaries are paid from
  Payroll → Payroll items      the pending bonus, recovery, loans and Arjun's settlement
  Payroll → Tax declarations   Karan (old regime), Riya (verified), Vikram (previous employer)
  Requests                     pending overtime, partial leave and expense claims to approve or reject
  Console → Payroll rates      every statutory table and which are still unconfirmed
${PEOPLE.map((p) => `  ${p.first.padEnd(7)} ${p.note}`).join("\n")}

${has("razorpay") ? `Paying with Razorpay (test mode): Payroll → Salary Payouts → initiate. Payouts are created for last month's run. For the status to turn "paid" Razorpay must reach
your server: set a webhook (events payout.processed, payout.failed, payout.reversed, payout.rejected) to  <your public URL>${paymentWebhookPaths(companyId).payouts}  with the same secret as SEED_RZP_WEBHOOK_SECRET. On localhost use a tunnel (ngrok or cloudflared).

` : ""}Remove it all with: npm run seed:payroll -- --company ${slug} --reset-only`);
  void (null as unknown as ObjectId);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
