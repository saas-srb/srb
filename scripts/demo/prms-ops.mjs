// PRMS operations (expenses, SaaS subscriptions, infrastructure, budgets, vendor invoices, payments) + PMS per-project activity.
// Feeds the PRMS executive dashboard / analytics, which read these collections directly.
import { rint, pick, chance, weighted, ago, audit, dayAgo, dayAhead, isoDay, personName, insertAll } from "./lib.mjs";

const SAAS = [
  ["GitHub Enterprise", "GitHub", 25, 2100, "monthly"], ["Google Workspace", "Google", 160, 460, "monthly"], ["Microsoft 365", "Microsoft", 40, 900, "monthly"], ["Slack Business+", "Salesforce", 90, 1050, "monthly"],
  ["Figma Organisation", "Figma", 12, 3600, "monthly"], ["Notion Team", "Notion", 60, 700, "monthly"], ["Zoom Business", "Zoom", 30, 1800, "monthly"], ["Atlassian Jira & Confluence", "Atlassian", 80, 1300, "monthly"],
  ["OpenAI API", "OpenAI", 1, 42000, "monthly"], ["Vercel Pro", "Vercel", 8, 1700, "monthly"], ["JetBrains All Products", "JetBrains", 20, 62000, "annual"], ["Adobe Creative Cloud", "Adobe", 6, 190000, "annual"],
  ["Postman Team", "Postman", 20, 15000, "quarterly"], ["Sentry Business", "Sentry", 1, 9000, "monthly"], ["ElevenLabs Creator", "ElevenLabs", 3, 8500, "monthly"], ["Canva Teams", "Canva", 15, 4500, "quarterly"],
];
const INFRA = [
  ["Production cluster (ap-south-1)", "AWS", "Cloud Hosting", "Mumbai", 96000, "monthly"], ["Staging environment", "AWS", "Cloud Hosting", "Mumbai", 24000, "monthly"], ["MongoDB Atlas M30", "MongoDB", "Database Hosting", "Mumbai", 38000, "monthly"],
  ["Azure DevOps agents", "Microsoft Azure", "Cloud Hosting", "Central India", 18500, "monthly"], ["Cloudflare Business", "Cloudflare", "CDN", "Global", 15000, "monthly"], ["Backup storage (S3 Glacier)", "AWS", "Backup Storage", "Mumbai", 7200, "monthly"],
  ["DigitalOcean droplets", "DigitalOcean", "VPS", "Bengaluru", 11000, "monthly"], ["example.com domain + SSL", "GoDaddy", "Domain", "Global", 18000, "annual"], ["Office leased line (1 Gbps)", "Airtel Business", "Internet", "Noida", 36000, "monthly"], ["Dedicated GPU server", "E2E Networks", "Dedicated Servers", "Delhi", 54000, "monthly"],
];
const EXPENSES = [
  ["office_operations", ["Rent", "Electricity", "Internet", "Water", "Telephone"], 8000, 180000], ["infrastructure", ["Cloud Hosting", "Servers", "Domain", "CDN", "Backup Storage"], 6000, 110000],
  ["software_saas", ["GitHub", "Figma", "Slack", "Vercel", "OpenAI", "Zoom"], 2500, 60000], ["marketing", ["Google Ads", "Meta Ads", "LinkedIn Ads", "SEO Tools"], 10000, 150000],
  ["professional_services", ["CA", "Legal", "Consultancy", "Recruitment"], 8000, 90000], ["others", ["Travel", "Food", "Training", "Miscellaneous"], 1500, 40000],
];
const METHODS = ["bank_transfer", "upi", "credit_card", "net_banking", "auto_debit"];

const monthlyOf = (cost, cycle) => Math.round((cycle === "annual" ? cost / 12 : cycle === "quarterly" ? cost / 3 : cycle === "biennial" ? cost / 24 : cost) * 100) / 100;

export async function seedPrmsOps(db, pms) {
  const wipe = (name) => db.collection(name).deleteMany({ _id: /^demo-/ });
  const vendors = await db.collection("prms_vendors").find({ _id: /^demo-vendor-/ }).toArray();
  const depts = await db.collection("hrms_departments").find({ _id: /^demo-dept-/ }).toArray();
  const emps = await db.collection("hrms_employees").find({ _id: /^demo-emp-/ }).project({ _id: 1, firstName: 1, lastName: 1, workEmail: 1, adminUserId: 1 }).limit(40).toArray();
  const pool = emps.length ? emps : [{ _id: "demo-emp-1", firstName: "Admin", lastName: "User", workEmail: "admin@example.com", adminUserId: "demo" }];
  const deptList = depts.length ? depts : [{ _id: "demo-dept-ENG", name: "Engineering & Technology" }];
  const empName = (e) => `${e.firstName} ${e.lastName}`;

  // ---- expenses: ~14 months of history, trend-shaped ----
  const expenses = [];
  for (let m = 13; m >= 0; m--) {
    const perMonth = rint(14, 22);
    for (let i = 0; i < perMonth; i++) {
      const [category, subs, lo, hi] = pick(EXPENSES);
      const vendor = chance(0.8) ? pick(vendors) : null;
      const dept = pick(deptList);
      const amount = Math.round(rint(lo, hi) * (1 + (13 - m) * 0.012));
      const gstRate = pick([0, 5, 12, 18, 18]);
      const gstAmount = Math.round(amount * gstRate / 100);
      const at = ago(m * 30 + rint(0, 27));
      const status = m === 0 ? weighted([["pending", 3], ["approved", 5], ["rejected", 0.5]]) : weighted([["approved", 6], ["reimbursed", 3], ["rejected", 0.6], ["pending", 0.4]]);
      const raiser = pick(pool);
      const recurring = chance(0.25);
      expenses.push({
        _id: `demo-exp-${expenses.length + 1}`, expenseCode: `EXP-2026-${String(expenses.length + 1).padStart(4, "0")}`, category, subcategory: pick(subs), vendorId: vendor?._id ?? null, vendorName: vendor?.companyName ?? null,
        departmentId: dept._id, departmentName: dept.name, projectId: null, projectName: null, amount, gstRate, gstAmount, totalAmount: amount + gstAmount, currency: "INR", paymentMethod: pick(METHODS),
        invoiceNumber: chance(0.7) ? `INV-${rint(10000, 99999)}` : null, invoiceStorageKey: null, invoiceFilename: null, expenseDate: at, description: null, expenseType: recurring ? "recurring" : "one_time",
        recurrence: recurring ? { interval: pick(["monthly", "quarterly"]), nextRunDate: dayAhead(rint(5, 60)), active: true } : null, parentExpenseId: null, approvalStatus: status,
        approvedBy: status === "approved" || status === "reimbursed" ? "admin@example.com" : null, approvedAt: status === "approved" || status === "reimbursed" ? new Date(at.getTime() + 86400000) : null,
        rejectionReason: status === "rejected" ? "Not covered by the approved budget." : null, raisedByUserId: raiser.adminUserId ?? raiser._id, raisedByName: empName(raiser), ...audit(at),
      });
    }
  }

  // ---- subscriptions ----
  const subscriptions = SAAS.map(([serviceName, provider, licenseCount, cost, billingCycle], i) => {
    const owner = pick(pool);
    const monthlyCost = monthlyOf(cost, billingCycle);
    const status = i === 14 ? "expiring" : i === 15 ? "cancelled" : "active";
    return { _id: `demo-sub-${i + 1}`, serviceName, provider, licenseCount, cost, billingCycle, monthlyCost, annualCost: Math.round(monthlyCost * 12 * 100) / 100, currency: "INR", renewalDate: dayAhead(status === "expiring" ? rint(3, 20) : rint(20, 330)), ownerEmployeeId: owner._id, ownerName: empName(owner), autoRenew: status !== "cancelled" && chance(0.75), vendorId: null, vendorName: null, status, notes: null, ...audit(ago(rint(60, 500))) };
  });

  // ---- infrastructure ----
  const infra = INFRA.map(([name, provider, resourceType, region, cost, billingCycle], i) => ({
    _id: `demo-infra-${i + 1}`, name, provider, resourceType, region, cost, billingCycle, monthlyCost: monthlyOf(cost, billingCycle), currency: "INR", renewalDate: dayAhead(rint(10, 300)), autoRenew: chance(0.8), vendorId: null, vendorName: null,
    status: i === 6 ? "expiring" : "active", notes: null, ...audit(ago(rint(30, 400))),
  }));

  // ---- budgets (this year: company + departments + categories) ----
  const y = new Date().getFullYear();
  const yStart = new Date(y, 0, 1);
  const yEnd = new Date(y, 11, 31);
  const yearSpend = (pred) => expenses.filter((e) => e.expenseDate >= yStart && ["approved", "reimbursed"].includes(e.approvalStatus) && pred(e)).reduce((s, e) => s + e.amount, 0);
  const budgets = [];
  const addBudget = (name, level, scopeId, scopeName, allocated, consumed) => budgets.push({
    _id: `demo-budget-${budgets.length + 1}`, budgetCode: `BUD-${y}-${String(budgets.length + 1).padStart(3, "0")}`, name, level, scopeId, scopeName, period: "yearly", periodStart: yStart, periodEnd: yEnd, allocatedAmount: allocated, consumedAmount: consumed, currency: "INR", notes: null, ...audit(ago(rint(150, 260))),
  });
  const totalYear = yearSpend(() => true);
  addBudget(`Company operating budget ${y}`, "company", null, "Demo Company", Math.round(totalYear * 1.6 / 100000) * 100000 + 500000, totalYear);
  for (const d of deptList.slice(0, 6)) {
    const spent = yearSpend((e) => e.departmentId === d._id);
    addBudget(`${d.name} budget ${y}`, "department", d._id, d.name, Math.round(spent * 1.5 / 50000) * 50000 + 200000, spent);
  }
  for (const [c] of EXPENSES) {
    const spent = yearSpend((e) => e.category === c);
    addBudget(`${c.replace(/_/g, " ")} budget ${y}`, "category", c, c.replace(/_/g, " "), Math.round(spent * 1.4 / 50000) * 50000 + 100000, spent);
  }

  // ---- vendor invoices + payments (against the demo purchase orders) ----
  const orders = await db.collection("prms_purchase_orders").find({ _id: /^demo-po-/ }).toArray();
  const invoices = [];
  const payments = [];
  const invoiceSources = [...orders.map((po) => ({ po })), ...Array.from({ length: 24 }, () => ({ po: null }))];
  for (const src of invoiceSources) {
    const vendor = src.po ? vendors.find((v) => v._id === src.po.vendorId) ?? pick(vendors) : pick(vendors);
    const subtotal = src.po ? src.po.taxableAmount : rint(12, 260) * 1000;
    const gstAmount = src.po ? src.po.gstAmount : Math.round(subtotal * 0.18);
    const tdsRate = pick([0, 1, 2, 10]);
    const tdsAmount = Math.round(subtotal * tdsRate / 100);
    const total = subtotal + gstAmount;
    const netPayable = total - tdsAmount;
    const issued = rint(5, 150);
    const dueOffset = rint(-25, 35);
    const status = weighted([["paid", 5], ["partially_paid", 1.5], ["approved", 2], ["pending", 2], ["overdue", dueOffset < 0 ? 2 : 0.2]]);
    const paid = status === "paid" ? netPayable : status === "partially_paid" ? Math.round(netPayable * pick([0.3, 0.5, 0.6])) : 0;
    const inv = {
      _id: `demo-vinv-${invoices.length + 1}`, invoiceNumber: `VINV-2026-${String(invoices.length + 1).padStart(4, "0")}`, vendorInvoiceNumber: `${vendor.companyName.slice(0, 3).toUpperCase()}/${rint(1000, 9999)}`, vendorId: vendor._id, vendorName: vendor.companyName,
      poId: src.po?._id ?? null, poNumber: src.po?.poNumber ?? null, invoiceDate: dayAgo(issued), dueDate: dayAhead(dueOffset), subtotal, gstAmount, tdsRate, tdsAmount, totalAmount: total, netPayable, amountPaid: paid, currency: "INR", status,
      storageKey: null, filename: null, poMatched: !!src.po, grnMatched: !!src.po && chance(0.8), notes: null, ...audit(ago(issued)),
    };
    invoices.push(inv);
    if (paid > 0) {
      const parts = status === "paid" && chance(0.3) ? 2 : 1;
      for (let k = 0; k < parts; k++) {
        payments.push({
          _id: `demo-vpay-${payments.length + 1}`, paymentCode: `PAY-2026-${String(payments.length + 1).padStart(4, "0")}`, invoiceId: inv._id, invoiceNumber: inv.invoiceNumber, vendorId: vendor._id, vendorName: vendor.companyName,
          amount: Math.round(paid / parts), paymentDate: ago(Math.max(1, issued - rint(2, 25) - k * 6)), method: pick(METHODS), transactionReference: `UTR${rint(100000000, 999999999)}`, tdsDeducted: Math.round(tdsAmount / parts), status: "processed", notes: null, ...audit(ago(Math.max(1, issued - 10))),
        });
      }
    }
  }
  // a few scheduled payments for the upcoming-payments view
  for (const inv of invoices.filter((i) => ["approved", "pending"].includes(i.status)).slice(0, 6)) {
    payments.push({ _id: `demo-vpay-${payments.length + 1}`, paymentCode: `PAY-2026-${String(payments.length + 1).padStart(4, "0")}`, invoiceId: inv._id, invoiceNumber: inv.invoiceNumber, vendorId: inv.vendorId, vendorName: inv.vendorName, amount: inv.netPayable, paymentDate: new Date(Date.now() + rint(2, 20) * 86400000), method: "bank_transfer", transactionReference: null, tdsDeducted: inv.tdsAmount, status: "scheduled", notes: null, ...audit(ago(rint(1, 5))) });
  }

  // ---- PMS per-project activity timeline ----
  const tasks = await db.collection("pms_tasks").find({ _id: /^demo-task-/ }).toArray();
  const actors = pool.slice(0, 12);
  const activity = [];
  for (const p of pms.projects) {
    const at0 = rint(60, 200);
    const push = (action, entity, entityId, entityLabel, summary, daysAgo) => {
      const a = pick(actors);
      activity.push({ _id: `demo-act-${activity.length + 1}`, actorId: a.adminUserId ?? a._id, actorEmail: a.workEmail, action, entity, entityId, entityLabel, summary, metadata: null, projectId: p._id, createdAt: ago(daysAgo, rint(9, 19)) });
    };
    push("create", "project", p._id, p.name ?? p.projectCode, "Project created", at0);
    push("status_change", "project", p._id, p.name ?? p.projectCode, "status: planning → in_progress", at0 - rint(3, 10));
    push("progress_update", "project", p._id, p.name ?? p.projectCode, `progress: ${rint(10, 40)}% → ${rint(45, 90)}%`, rint(2, 20));
    for (const t of tasks.filter((x) => x.projectId === p._id).slice(0, 6)) {
      push("create", "task", t._id, t.title, "Task created", rint(20, 90));
      if (t.status !== "todo") push("move", "task", t._id, t.title, `status: todo → ${t.status}`, rint(1, 25));
      if (chance(0.3)) push("comment", "task_comment", t._id, t.title, "Comment added", rint(1, 20));
    }
  }

  for (const c of ["prms_expenses", "prms_software_subscriptions", "prms_infrastructure", "prms_budgets", "prms_invoices", "prms_payments", "pms_activity_logs"]) await wipe(c);
  for (const [c, f] of [["prms_expenses", { expenseCode: { $exists: false } }], ["prms_software_subscriptions", { serviceName: { $exists: false } }], ["prms_infrastructure", { resourceType: { $exists: false } }], ["prms_budgets", { $or: [{ budgetCode: { $exists: false } }, { periodStart: { $exists: false } }] }], ["prms_invoices", { invoiceNumber: { $exists: false } }], ["prms_payments", { paymentCode: { $exists: false } }]]) await db.collection(c).deleteMany(f);
  // orphaned base-seeder projects (their clients were removed as wrong-shaped) can't open; drop them with their children
  const clientIds = (await db.collection("pms_clients").find({}).project({ _id: 1 }).toArray()).map((c) => c._id);
  const orphans = (await db.collection("pms_projects").find({ clientId: { $nin: clientIds } }).project({ _id: 1 }).toArray()).map((p) => p._id);
  if (orphans.length) {
    await db.collection("pms_projects").deleteMany({ _id: { $in: orphans } });
    for (const c of ["pms_tasks", "pms_milestones", "pms_project_members", "pms_timesheets", "pms_documents", "pms_activity_logs"]) await db.collection(c).deleteMany({ projectId: { $in: orphans } });
  }
  // Messenger sync maps project team -> chat users through employeeId; link the super admin so they stay in project channels
  await db.collection("admin_users").updateOne({ email: "admin@example.com" }, { $set: { employeeId: "demo-emp-1" } });
  await db.collection("chat_users").updateOne({ email: "admin@example.com" }, { $set: { employeeId: "demo-emp-1" } });
  await db.collection("chat_meta").deleteMany({ _id: /project/i });
  await insertAll(db.collection("prms_expenses"), expenses);
  await insertAll(db.collection("prms_software_subscriptions"), subscriptions);
  await insertAll(db.collection("prms_infrastructure"), infra);
  await insertAll(db.collection("prms_budgets"), budgets);
  await insertAll(db.collection("prms_invoices"), invoices);
  await insertAll(db.collection("prms_payments"), payments);
  await insertAll(db.collection("pms_activity_logs"), activity);
  console.log(`  ✓ PRMS ops: ${expenses.length} expenses, ${subscriptions.length} subscriptions, ${infra.length} infra resources, ${budgets.length} budgets, ${invoices.length} vendor invoices, ${payments.length} payments; PMS ${activity.length} activity entries`);
}
