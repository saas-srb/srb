// Cross-product repair + fill: removes the wrong-shaped docs the legacy base seeder wrote (they crash pages), then seeds schema-correct data for
// HRMS (org, employees, leave), FMS (chart of accounts, ledger transactions), TMS and the audit trail of every module.
import { rng, rint, pick, chance, weighted, shuffle, ago, audit, dayAgo, dayAhead, isoDay, personName, slug, phone, CITIES, insertAll } from "./lib.mjs";

const AUDIT = {
  pms_activity_logs: { entities: ["client", "project", "milestone", "task"], actions: ["create", "update", "status_change", "progress_update"] },
  hrms_audit_logs: { entities: ["employee", "department", "leave_request", "attendance", "payroll_run", "offer"], actions: ["create", "update", "approve", "status_change"] },
  fms_activity_logs: { entities: ["invoice", "receipt", "transaction", "credit_note"], actions: ["create", "update", "approve", "status_change"] },
  training_audit_logs: { entities: ["program", "batch", "student", "assignment", "certificate", "payment"], actions: ["create", "update", "enroll", "issue", "record"] },
  prms_activity_logs: { entities: ["vendor", "requisition", "purchase_order", "asset"], actions: ["create", "update", "approve", "status_change"] },
  chat_activity_logs: { entities: ["channel", "message", "announcement"], actions: ["create", "update", "delete"] },
  portal_activity_logs: { entities: ["account", "lead", "document"], actions: ["register", "login", "lead_added", "profile_update"] },
};

const DEPTS = [["Engineering & Technology", "ENG"], ["Human Resources", "HR"], ["Finance & Accounts", "FIN"], ["Sales & Business Development", "SLS"], ["Education & Training", "EDU"], ["Marketing & Communications", "MKT"], ["Operations", "OPS"], ["Procurement", "PROC"]];
const TITLES = { ENG: ["Software Engineer", "Senior Engineer", "Tech Lead", "QA Engineer", "DevOps Engineer"], HR: ["HR Executive", "Talent Partner", "HR Manager"], FIN: ["Accountant", "Finance Analyst", "Finance Manager"], SLS: ["BD Executive", "Account Manager", "Sales Lead"], EDU: ["Trainer", "Mentor", "Program Coordinator"], MKT: ["Content Writer", "Performance Marketer", "Brand Designer"], OPS: ["Operations Executive", "Office Admin"], PROC: ["Procurement Officer", "Vendor Manager"] };

const ACCOUNTS = [
  ["1000", "Cash in Hand", "asset"], ["1010", "Bank — Operating Account", "asset"], ["1100", "Accounts Receivable", "asset"], ["1500", "Fixed Assets", "asset"],
  ["2000", "Accounts Payable", "liability"], ["2100", "GST Payable", "liability"], ["3000", "Owner's Equity", "equity"],
  ["4000", "Software Services Revenue", "income"], ["4010", "Training & Internship Revenue", "income"], ["4020", "Staffing Revenue", "income"],
  ["5000", "Salaries & Wages", "expense"], ["5100", "Cloud & Infrastructure", "expense"], ["5200", "Marketing & Ads", "expense"], ["5300", "Rent & Utilities", "expense"], ["5400", "Software Subscriptions", "expense"], ["5500", "Travel & Meals", "expense"],
];

async function wipeLegacy(db) {
  // The base seeder wrote docs in a different, non-app shape (ObjectId `_id`s, flat fields). Any collection the app keys by string ids can't open them,
  // and several list pages crash on them — remove exactly those legacy-shaped docs (real app-created records use string ids and are never touched).
  const objId = { _id: { $type: "objectId" } };
  const rules = {
    career_applications: { resume: { $exists: false }, _demo: { $ne: true } },
    portal_interviews: { applicationId: { $exists: false } },
    live_projects: { projectCode: { $exists: false } },
    pms_clients: { primaryContact: { $exists: false } },
    pms_activity_logs: { actorId: { $exists: false } },
    hrms_audit_logs: { actorId: { $exists: false } },
    hrms_employees: { personal: { $exists: false } },
    hrms_leave_requests: { employeeId: { $exists: false } },
    hrms_leave_balances: { employeeId: { $exists: false } },
    hrms_leave_types: { code: { $exists: false } },
    hrms_designations: { departmentId: { $exists: false } },
    hrms_departments: { headEmployeeId: { $exists: false } },
    hrms_teams: { departmentId: { $exists: false } },
    hrms_payroll_runs: objId, hrms_payslips: objId, hrms_salary_payouts: objId, hrms_salary_revisions: objId, hrms_payroll_profiles: objId,
    fms_accounts: objId, fms_journal_entries: objId,
    fms_transactions: { postingDate: { $exists: false } },
    fms_bank_accounts: { accountName: { $exists: false } },
    fms_cash_accounts: { accountName: { $exists: false } },
  };
  let removed = 0;
  for (const [name, filter] of Object.entries(rules)) removed += (await db.collection(name).deleteMany(filter)).deletedCount;
  return removed;
}

/** Base-seeder docs often lack the audit stamps every app list assumes (createdAt / updatedAt / deletedAt …). Backfill them so lists render instead of crashing. */
async function backfillStamps(db) {
  const now = new Date();
  let touched = 0;
  const names = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => /^(prms_|pms_|fms_|hrms_|training_)/.test(n) && !/counters|meta|sessions|activity_logs|audit_logs/.test(n));
  for (const name of names) {
    const col = db.collection(name);
    const r1 = await col.updateMany({ createdAt: { $exists: false } }, [{ $set: { createdAt: { $ifNull: ["$updatedAt", now] } } }]);
    const r2 = await col.updateMany({ updatedAt: { $exists: false } }, [{ $set: { updatedAt: { $ifNull: ["$createdAt", now] } } }]);
    const r3 = await col.updateMany({ deletedAt: { $exists: false } }, { $set: { deletedAt: null } });
    touched += r1.modifiedCount + r2.modifiedCount + r3.modifiedCount;
  }
  return touched;
}

export async function seedPanels(db, tms, pms) {
  const removed = await wipeLegacy(db);
  const backfilled = await backfillStamps(db);
  const wipe = (name) => db.collection(name).deleteMany({ _id: /^demo-/ });

  // ---------------------------------------------------------------- HRMS org + employees
  const departments = DEPTS.map(([name, code], i) => ({ _id: `demo-dept-${code}`, name, code, description: `${name} department`, headEmployeeId: null, ...audit(ago(400)) }));
  const designations = departments.flatMap((d) => TITLES[d.code].map((title, i) => ({ _id: `demo-desig-${d.code}-${i + 1}`, title, departmentId: d._id, level: pick(["L1", "L2", "L3", "L4"]), ...audit(ago(380)) })));
  const teams = departments.map((d) => ({ _id: `demo-team-${d.code}`, name: `${d.name.split(" ")[0]} Core Team`, departmentId: d._id, leadEmployeeId: null, ...audit(ago(360)) }));

  const admins = await db.collection("admin_users").find({}).project({ email: 1 }).limit(150).toArray();
  const employees = admins.map((a, i) => {
    const dept = departments[i % departments.length];
    const desig = pick(designations.filter((x) => x.departmentId === dept._id));
    const name = i === 0 ? "System Super Admin" : personName();
    const [first, ...rest] = name.split(" ");
    const joined = dayAgo(rint(90, 1200));
    return {
      _id: `demo-emp-${i + 1}`, employeeCode: `EMP-${String(2000 + i)}`, firstName: first, lastName: rest.join(" ") || "Kumar", workEmail: a.email, email: a.email,
      status: weighted([["active", 12], ["probation", 2], ["on_leave", 1], ["notice_period", 0.4]]),
      personal: { dateOfBirth: `${rint(1985, 2000)}-${String(rint(1, 12)).padStart(2, "0")}-${String(rint(1, 28)).padStart(2, "0")}`, gender: pick(["male", "female", "male", "female", "other"]), maritalStatus: pick(["single", "married"]), personalEmail: `${slug(name)}@mail.demo.in`, phone: phone(), addressLine: `${rint(1, 400)} Green Park`, city: pick(CITIES), state: "India", postalCode: String(rint(110000, 700000)), photoKey: null },
      professional: { departmentId: dept._id, designationId: desig._id, teamId: `demo-team-${dept.code}`, reportingManagerId: null, employmentType: weighted([["full_time", 10], ["contract", 1.5], ["intern", 1.5], ["consultant", 0.6]]), workLocation: pick(["Noida HQ", "Remote", "Bengaluru", "Hybrid"]), joiningDate: joined, probationEndDate: null, relievingDate: null },
      emergencyContacts: [{ name: personName(), relationship: pick(["Spouse", "Parent", "Sibling"]), phone: phone() }], recruitment: null, adminUserId: String(a._id), ...audit(ago(rint(30, 500))),
    };
  });
  for (const e of employees) e.professional.reportingManagerId = e._id === "demo-emp-1" ? null : "demo-emp-1";

  // leave
  const leaveTypes = [["casual", "Casual Leave", true, 12], ["sick", "Sick Leave", true, 12], ["earned", "Earned Leave", true, 15], ["wfh", "Work From Home", true, 0], ["unpaid", "Unpaid Leave", false, 0]].map(([code, label, paid, quota]) => ({ _id: `demo-lt-${code}`, code, label, paid, defaultAnnualQuota: quota, allowNegativeBalance: quota === 0, colorClass: "bg-primary/15 text-primary", active: true, ...audit(ago(400)) }));
  const year = new Date().getFullYear();
  const balances = [];
  const requests = [];
  employees.forEach((e, i) => {
    for (const t of leaveTypes.filter((x) => x.defaultAnnualQuota > 0)) {
      const used = rint(0, Math.min(6, t.defaultAnnualQuota));
      balances.push({ _id: `demo-lb-${i + 1}-${t.code}`, employeeId: e._id, leaveTypeCode: t.code, year, allocated: t.defaultAnnualQuota, used, pending: chance(0.15) ? rint(1, 2) : 0, ...audit(ago(200)) });
    }
    const n = rint(1, 3);
    for (let k = 0; k < n; k++) {
      const t = pick(leaveTypes);
      const startAgo = rint(-20, 120);
      const days = rint(1, 4);
      const status = startAgo < 0 ? weighted([["pending", 6], ["approved", 3]]) : weighted([["approved", 8], ["rejected", 1], ["cancelled", 0.6], ["pending", 0.5]]);
      requests.push({ _id: `demo-lr-${requests.length + 1}`, employeeId: e._id, leaveTypeCode: t.code, startDate: dayAgo(startAgo), endDate: dayAgo(startAgo - days + 1), halfDayStart: false, halfDayEnd: false, days, reason: pick(["Family function", "Medical appointment", "Personal work", "Travel", "Not feeling well"]), status, appliedBy: e._id, decidedBy: status === "pending" ? null : "demo-emp-1", decidedAt: status === "pending" ? null : ago(Math.max(1, startAgo)), decisionNote: null, ...audit(ago(Math.max(1, startAgo + 3))) });
    }
  });

  // payroll: a profile per employee, then monthly runs (older paid, latest draft) with a payslip each
  const profiles = employees.map((e, i) => {
    const basic = pick([30000, 42000, 55000, 68000, 85000, 110000]);
    const hra = Math.round(basic * 0.4);
    return { _id: `demo-pp-${i + 1}`, employeeId: e._id, currency: "INR", basic, hra, allowances: [{ name: "Special allowance", amount: Math.round(basic * 0.25) }, { name: "Travel allowance", amount: 3200 }], deductions: [{ name: "Provident fund", amount: Math.round(basic * 0.12) }, { name: "Professional tax", amount: 200 }], pfNumber: `PF/DEL/${rint(100000, 999999)}`, esiNumber: null, uan: String(rint(100000000000, 999999999999)), panNumber: `ABCDE${rint(1000, 9999)}F`, bank: { accountName: `${e.firstName} ${e.lastName}`, accountNumber: String(rint(10000000000, 99999999999)), ifsc: "HDFC0000123", bankName: pick(["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank"]), branch: "Main Branch" }, ...audit(ago(200)) };
  });
  const runs = [];
  const payslips = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(Date.now() - m * 30 * 86400000);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const status = m >= 2 ? "paid" : m === 1 ? "approved" : "draft";
    const runId = `demo-run-${month}`;
    let gross = 0, ded = 0, net = 0, cost = 0;
    employees.forEach((e, i) => {
      const pr = profiles[i];
      const working = 22;
      const lop = chance(0.08) ? rint(1, 2) : 0;
      const earningsBase = pr.basic + pr.hra + pr.allowances.reduce((x, a) => x + a.amount, 0);
      const lopAmount = Math.round((earningsBase / working) * lop);
      const grossPay = earningsBase - lopAmount;
      const deductions = [...pr.deductions, { name: "TDS", amount: Math.round(grossPay * 0.04) }];
      const totalDed = deductions.reduce((x, a) => x + a.amount, 0);
      const employer = [{ name: "Employer PF", amount: Math.round(pr.basic * 0.12) }];
      const employerCost = grossPay + employer[0].amount;
      payslips.push({ _id: `demo-ps-${month}-${i + 1}`, runId, month, employeeId: e._id, employeeCode: e.employeeCode, employeeName: `${e.firstName} ${e.lastName}`, workingDays: working, lopDays: lop, lopAmount, earnings: [{ name: "Basic", amount: pr.basic }, { name: "HRA", amount: pr.hra }, ...pr.allowances], grossPay, deductions, totalDeductions: totalDed, employerContributions: employer, employerCost, netPay: grossPay - totalDed, overrides: { arrears: 0, manualTds: null, otherDeductions: 0 }, bankAccountId: null, bankAccountLast4: pr.bank.accountNumber.slice(-4), bankName: pr.bank.bankName, ifsc: pr.bank.ifsc, updatedAt: d });
      gross += grossPay; ded += totalDed; net += grossPay - totalDed; cost += employerCost;
    });
    runs.push({ _id: runId, month, status, payslipCount: employees.length, totalGross: gross, totalDeductions: ded, totalNet: net, totalEmployerCost: cost, generatedBy: "demo-emp-1", generatedAt: d, approvedBy: status === "draft" ? null : "demo-emp-1", approvedAt: status === "draft" ? null : d, paidBy: status === "paid" ? "demo-emp-1" : null, paidAt: status === "paid" ? d : null });
  }

  // ---------------------------------------------------------------- FMS chart of accounts + ledger
  const accounts = ACCOUNTS.map(([code, name, type]) => ({ _id: `demo-acc-${code}`, code, name, type, parentId: null, description: null, isActive: true, ...audit(ago(420)) }));
  const bankAccounts = [["HDFC Bank — Current A/c", "HDFC Bank", "6778", 8200000], ["ICICI Bank — Collections", "ICICI Bank", "4421", 3100000], ["Axis Bank — Payroll", "Axis Bank", "9035", 5600000]].map(([accountName, bankName, last4, bal], i) => ({ _id: `demo-bank-${i + 1}`, accountName, bankName, accountNumberEnc: null, accountNumberLast4: last4, ifsc: "HDFC0000123", branch: "Noida Sector 62", currency: "INR", openingBalance: bal * 0.6, currentBalance: bal, status: "active", notes: null, ...audit(ago(300)) }));
  const cashAccounts = [["Head Office Petty Cash", "Noida HQ", 75000], ["Training Center Cash", "Training Wing", 32000]].map(([accountName, location, bal], i) => ({ _id: `demo-cash-${i + 1}`, accountName, location, department: null, currency: "INR", openingBalance: bal, currentBalance: bal, status: "active", notes: null, ...audit(ago(280)) }));
  const revAcc = { software: "demo-acc-4000", training: "demo-acc-4010", staffing: "demo-acc-4020" };
  const receipts = await db.collection("fms_receipts").find({ _id: /^demo-/ }).toArray();
  const invProject = new Map((await db.collection("fms_invoices").find({ _id: /^demo-/ }).project({ projectId: 1 }).toArray()).map((i) => [i._id, i.projectId]));
  let tn = 0;
  const transactions = receipts.map((r) => ({
    _id: `demo-txn-${++tn}`, transactionNumber: `TXN-2026-D${String(tn).padStart(5, "0")}`, type: "income", transactionDate: r.receiptDate, postingDate: r.receiptDate, amount: r.amount, currency: "INR", paymentMethod: r.method, sourceModule: "fms", sourceRecordId: r._id,
    customerId: r.customerId, vendorId: null, employeeId: null, projectId: invProject.get(r.allocations?.[0]?.invoiceId) ?? null, department: null, accountId: pick(Object.values(revAcc)), fundAccountId: pick(["demo-bank-1", "demo-bank-2"]), fundAccountType: "bank", transferId: null, taxAmount: Math.round(r.amount * 0.15), referenceNumber: r.transactionReference, description: `Receipt ${r.receiptNumber} from ${r.customerName}`, attachments: [], approvedBy: "demo", approvedAt: r.receiptDate, status: "completed", ...audit(r.receiptDate),
  }));
  // student fee instalments flow into the ledger as TMS income
  for (const plan of tms.plans) for (const inst of plan.installments) transactions.push({ _id: `demo-txn-${++tn}`, transactionNumber: `TXN-2026-D${String(tn).padStart(5, "0")}`, type: "income", transactionDate: new Date(inst.paidOn), postingDate: new Date(inst.paidOn), amount: inst.amount, currency: "INR", paymentMethod: "upi", sourceModule: "tms", sourceRecordId: plan._id, customerId: null, vendorId: null, employeeId: null, projectId: null, department: "TMS", accountId: "demo-acc-4010", fundAccountId: null, fundAccountType: null, transferId: null, taxAmount: 0, referenceNumber: inst.transactionId, description: `TMS course fee (${inst.invoiceNumber})`, attachments: [], approvedBy: "demo", approvedAt: new Date(inst.paidOn), status: "completed", ...audit(new Date(inst.paidOn)) });
  // operating expenses across the year
  const EXP = [["5000", "Payroll — monthly salaries", 900000, 2400000], ["5100", "Cloud & infrastructure bill", 60000, 240000], ["5200", "Ad spend — Meta / Google", 40000, 180000], ["5300", "Office rent & utilities", 120000, 260000], ["5400", "SaaS subscriptions", 20000, 90000], ["5500", "Travel & client meetings", 8000, 60000]];
  for (let m = 0; m < 11; m++) for (const [code, desc, lo, hi] of EXP) {
    const d = ago(m * 30 + rint(0, 25));
    transactions.push({ _id: `demo-txn-${++tn}`, transactionNumber: `TXN-2026-D${String(tn).padStart(5, "0")}`, type: "expense", transactionDate: d, postingDate: d, amount: rint(lo, hi), currency: "INR", paymentMethod: pick(["bank_transfer", "neft", "upi", "credit_card"]), sourceModule: code === "5000" ? "hrms" : "fms", sourceRecordId: null, customerId: null, vendorId: null, employeeId: null, projectId: null, department: pick(["Engineering", "Operations", "Marketing"]), accountId: `demo-acc-${code}`, fundAccountId: null, fundAccountType: null, transferId: null, taxAmount: 0, referenceNumber: `REF${rint(100000, 999999)}`, description: desc, attachments: [], approvedBy: "demo", approvedAt: d, status: "completed", ...audit(d) });
  }

  // ---------------------------------------------------------------- audit trails for every module
  const actors = employees.slice(0, 12);
  const auditDocs = {};
  for (const [col, cfg] of Object.entries(AUDIT)) {
    auditDocs[col] = Array.from({ length: 70 }, (_, i) => {
      const a = pick(actors);
      const entity = pick(cfg.entities);
      const action = pick(cfg.actions);
      return { _id: `demo-al-${col}-${i + 1}`, actorId: a._id, actorEmail: a.workEmail, action, entity, entityId: `demo-${entity}-${rint(1, 60)}`, entityLabel: `${entity.replace(/_/g, " ")} #${rint(100, 999)}`, summary: `${action.replace(/_/g, " ")} on ${entity.replace(/_/g, " ")}`, metadata: null, createdAt: ago(rint(0, 60)) };
    });
  }

  for (const c of ["hrms_departments", "hrms_designations", "hrms_teams", "hrms_employees", "hrms_leave_types", "hrms_leave_balances", "hrms_leave_requests", "hrms_payroll_profiles", "hrms_payroll_runs", "hrms_payslips", "fms_accounts", "fms_transactions", ...Object.keys(AUDIT)]) await wipe(c);
  await insertAll(db.collection("hrms_departments"), departments);
  await insertAll(db.collection("hrms_designations"), designations);
  await insertAll(db.collection("hrms_teams"), teams);
  await insertAll(db.collection("hrms_employees"), employees);
  await insertAll(db.collection("hrms_leave_types"), leaveTypes);
  await insertAll(db.collection("hrms_leave_balances"), balances);
  await insertAll(db.collection("hrms_leave_requests"), requests);
  await insertAll(db.collection("hrms_payroll_profiles"), profiles);
  try {
    await insertAll(db.collection("hrms_payroll_runs"), runs);
    await insertAll(db.collection("hrms_payslips"), payslips);
  } catch (err) {
    console.log("  ⚠ payroll runs skipped (a run for one of those months already exists):", String(err.message).slice(0, 80));
  }
  await wipe("fms_bank_accounts");
  await wipe("fms_cash_accounts");
  await insertAll(db.collection("fms_bank_accounts"), bankAccounts);
  await insertAll(db.collection("fms_cash_accounts"), cashAccounts);
  await insertAll(db.collection("fms_accounts"), accounts);
  await insertAll(db.collection("fms_transactions"), transactions);
  for (const [col, docs] of Object.entries(auditDocs)) await insertAll(db.collection(col), docs);
  console.log(`  ✓ Products: removed ${removed} legacy-shaped docs, backfilled ${backfilled} audit stamps; ${departments.length} departments, ${designations.length} designations, ${employees.length} employees, ${requests.length} leave requests, ${runs.length} payroll runs / ${payslips.length} payslips, ${accounts.length} accounts, ${transactions.length} ledger transactions, ${Object.values(auditDocs).flat().length} audit entries`);
}
