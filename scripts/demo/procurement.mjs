// PRMS (procurement) core — vendors, purchase requisitions, purchase orders, company assets — and PMS tasks for the demo projects.
// The base seeder wrote these in a different shape (no audit stamps, flat fields) and the PRMS lists crash on them.
import { rint, pick, chance, weighted, shuffle, ago, audit, dayAgo, dayAhead, personName, slug, phone, CITIES, insertAll } from "./lib.mjs";

const VENDORS = [
  ["Dell Technologies India", "hardware_supplier"], ["HP India Sales", "hardware_supplier"], ["Lenovo Enterprise", "hardware_supplier"], ["Amazon Web Services India", "cloud_provider"], ["Microsoft Azure Reseller", "cloud_provider"],
  ["Google Workspace Partner", "software_vendor"], ["Atlassian Reseller", "software_vendor"], ["JetBrains Distributor", "software_vendor"], ["Airtel Business", "internet_provider"], ["Jio Fiber Enterprise", "internet_provider"],
  ["Officeworks Supplies", "office_supplier"], ["Godrej Interio", "furniture_vendor"], ["Naukri Talent Solutions", "recruitment_agency"], ["Growth Metrics Agency", "marketing_agency"], ["Ledger Consulting LLP", "consultant"], ["TechCare AMC Services", "amc_vendor"],
];
const ITEMS = [["Developer laptop (16GB)", "hardware", 92000], ["27\" monitor", "hardware", 21000], ["Ergonomic chair", "furniture", 14500], ["Cloud credits — annual", "cloud", 240000], ["Team licences — project tracker", "software", 68000], ["Office broadband (1 Gbps)", "internet", 36000], ["Conference room display", "hardware", 58000], ["Standing desk", "furniture", 27000], ["Security camera set", "hardware", 45000], ["Stationery & consumables", "office", 12000]];
const ASSET_NAMES = [["MacBook Pro 14\"", "Laptop", "Apple"], ["Dell Latitude 5440", "Laptop", "Dell"], ["ThinkPad E14", "Laptop", "Lenovo"], ["Dell UltraSharp 27", "Monitor", "Dell"], ["Logitech MX Keys", "Peripheral", "Logitech"], ["Cisco Router RV340", "Networking", "Cisco"], ["Epson Projector", "AV", "Epson"], ["Herman Miller Chair", "Furniture", "Herman Miller"]];
const TASKS = ["Set up repository & CI", "Design database schema", "Implement authentication", "Build dashboard UI", "Integrate payment gateway", "Write API documentation", "Performance tuning", "QA regression pass", "Prepare UAT build", "Fix reported bugs", "Deploy to staging", "Client demo preparation"];

export async function seedProcurement(db, pms) {
  const wipe = (name) => db.collection(name).deleteMany({ _id: /^demo-/ });
  const employees = await db.collection("hrms_employees").find({ _id: /^demo-emp-/ }).project({ _id: 1, firstName: 1, lastName: 1, workEmail: 1, adminUserId: 1 }).limit(60).toArray();
  const emp = employees.length ? employees : [{ _id: "demo-emp-1", firstName: "Admin", lastName: "User", workEmail: "admin@example.com", adminUserId: "demo" }];
  const depts = await db.collection("hrms_departments").find({ _id: /^demo-dept-/ }).toArray();

  const vendors = VENDORS.map(([name, category], i) => ({
    _id: `demo-vendor-${i + 1}`, vendorCode: `VND-${String(i + 1).padStart(3, "0")}`, companyName: name, gstin: `07AAACB${rint(1000, 9999)}Q1Z${rint(1, 9)}`, pan: `AAACB${rint(1000, 9999)}Q`, contactPerson: personName(), email: `sales@${slug(name).replace(/\./g, "")}.com`, phone: phone(),
    addressLine: `${rint(1, 300)} Industrial Area`, city: pick(CITIES), state: "India", pincode: String(rint(110001, 700001)), bankDetails: { accountName: name, accountNumber: String(rint(1000000000, 9999999999)), ifsc: "HDFC0000456", bankName: "HDFC Bank", branch: "Corporate" },
    paymentTerms: pick(["net_15", "net_30", "net_45"]), currency: "INR", category, rating: pick([3.5, 4, 4.2, 4.5, 4.8, null]), status: i === 15 ? "inactive" : "active", notes: null, ...audit(ago(rint(60, 400))),
  }));

  const requisitions = [];
  const orders = [];
  const assets = [];
  for (let i = 0; i < 48; i++) {
    const [item, cat, price] = pick(ITEMS);
    const dept = pick(depts.length ? depts : [{ _id: "demo-dept-ENG", name: "Engineering & Technology" }]);
    const req = pick(emp);
    const qty = rint(1, 8);
    const status = weighted([["approved", 3], ["converted", 4], ["submitted", 2], ["manager_approval", 2], ["procurement_review", 1.5], ["rejected", 1], ["draft", 1]]);
    const created = ago(rint(3, 150));
    const approvedLike = ["approved", "converted"].includes(status);
    const levels = [["manager_approval", "Manager approval"], ["procurement_review", "Procurement review"]];
    const reqDoc = {
      _id: `demo-pr-${i + 1}`, prCode: `PR-2026-${String(i + 1).padStart(4, "0")}`, departmentId: dept._id, departmentName: dept.name, projectId: null, projectName: null,
      requestedBy: { userId: req.adminUserId ?? req._id, employeeId: req._id, name: `${req.firstName} ${req.lastName}`, email: req.workEmail }, category: cat, subcategory: null, itemName: item, quantity: qty, uom: "pcs", estimatedCost: price * qty, currency: "INR",
      requiredDate: dayAhead(rint(5, 45)), priority: pick(["low", "medium", "high", "medium"]), justification: "Needed for the current delivery cycle.", attachments: [], preferredVendorId: pick(vendors)._id, status,
      currentLevel: status === "submitted" || status === "draft" ? 0 : status === "manager_approval" ? 1 : status === "procurement_review" ? 2 : 2,
      approvals: levels.map(([st, label], k) => ({ level: k + 1, status: st, role: k === 0 ? "prms_manager" : "prms_admin", label, decision: approvedLike ? "approved" : status === "rejected" && k === 0 ? "rejected" : k === 0 && status === "procurement_review" ? "approved" : "pending", approverId: null, approverEmail: null, note: null, decidedAt: approvedLike ? created : null })),
      rejectionReason: status === "rejected" ? "Budget not available this quarter." : null, submittedAt: status === "draft" ? null : created, approvedAt: approvedLike ? new Date(created.getTime() + 2 * 86400000) : null, ...audit(created),
    };
    requisitions.push(reqDoc);
    if (status === "converted") {
      const vendor = pick(vendors);
      const unit = price;
      const gstRate = 18;
      const lineTotal = unit * qty;
      const gst = Math.round(lineTotal * (gstRate / 100));
      const poStatus = weighted([["issued", 3], ["partially_received", 2], ["received", 3], ["closed", 2]]);
      const received = poStatus === "received" || poStatus === "closed" ? qty : poStatus === "partially_received" ? Math.max(1, Math.floor(qty / 2)) : 0;
      const poId = `demo-po-${orders.length + 1}`;
      orders.push({
        _id: poId, poNumber: `PO-2026-${String(orders.length + 1).padStart(4, "0")}`, vendorId: vendor._id, vendorName: vendor.companyName, requisitionId: reqDoc._id, rfqId: null, departmentId: dept._id, departmentName: dept.name, projectId: null, projectName: null,
        items: [{ description: item, hsn: "8471", quantity: qty, uom: "pcs", unitPrice: unit, gstRate, lineTotal, gstAmount: gst, receivedQty: received }], subtotal: lineTotal, discount: 0, taxableAmount: lineTotal, gstAmount: gst, totalAmount: lineTotal + gst, currency: "INR",
        deliveryAddress: "Demo Company HQ, Noida", deliveryDate: dayAhead(rint(-20, 20)), paymentTerms: "Net 30", notes: null, status: poStatus, issuedAt: new Date(created.getTime() + 3 * 86400000), ...audit(new Date(created.getTime() + 3 * 86400000)),
      });
      if (cat === "hardware" && received > 0) {
        for (let k = 0; k < Math.min(received, 3); k++) {
          const [nm, acat, brand] = pick(ASSET_NAMES);
          const assignee = chance(0.6) ? pick(emp) : null;
          const cost = Math.round(unit);
          assets.push({ _id: `demo-asset-${assets.length + 1}`, assetCode: `AST-${String(assets.length + 1).padStart(4, "0")}`, name: nm, category: acat, brand, model: nm, serialNumber: `SN${rint(10000000, 99999999)}`, purchaseDate: new Date(created.getTime() + 8 * 86400000), purchaseCost: cost, currency: "INR", vendorId: vendor._id, vendorName: vendor.companyName, poId, warrantyExpiry: dayAhead(rint(120, 700)), officeLocation: pick(["Noida HQ", "Training Wing", "Bengaluru"]), depreciationMethod: "slm", usefulLifeYears: 4, salvageValue: Math.round(cost * 0.1), currentValue: Math.round(cost * rint(55, 95) / 100), status: assignee ? "assigned" : pick(["in_stock", "in_stock", "under_repair"]), assignedEmployeeId: assignee?._id ?? null, assignedEmployeeName: assignee ? `${assignee.firstName} ${assignee.lastName}` : null, assignedAt: assignee ? ago(rint(5, 100)) : null, notes: null, ...audit(ago(rint(5, 120))) });
        }
      }
    }
  }
  // extra in-stock assets so the register looks lived-in
  for (let i = 0; i < 24; i++) {
    const [nm, acat, brand] = pick(ASSET_NAMES);
    const vendor = pick(vendors);
    const cost = pick([9000, 18000, 32000, 58000, 96000]);
    const assignee = chance(0.7) ? pick(emp) : null;
    assets.push({ _id: `demo-asset-${assets.length + 1}`, assetCode: `AST-${String(assets.length + 1).padStart(4, "0")}`, name: nm, category: acat, brand, model: nm, serialNumber: `SN${rint(10000000, 99999999)}`, purchaseDate: ago(rint(60, 700)), purchaseCost: cost, currency: "INR", vendorId: vendor._id, vendorName: vendor.companyName, poId: null, warrantyExpiry: dayAhead(rint(-30, 500)), officeLocation: pick(["Noida HQ", "Training Wing", "Bengaluru", "Remote"]), depreciationMethod: pick(["slm", "wdv"]), usefulLifeYears: 4, salvageValue: Math.round(cost * 0.1), currentValue: Math.round(cost * rint(35, 90) / 100), status: assignee ? "assigned" : weighted([["in_stock", 3], ["under_repair", 1], ["retired", 0.5]]), assignedEmployeeId: assignee?._id ?? null, assignedEmployeeName: assignee ? `${assignee.firstName} ${assignee.lastName}` : null, assignedAt: assignee ? ago(rint(5, 300)) : null, notes: null, ...audit(ago(rint(30, 600))) });
  }

  // ---- PMS tasks for the demo projects (Kanban + progress) ----
  const tasks = [];
  for (const [pi, p] of pms.projects.entries()) {
    const n = rint(6, 11);
    for (let t = 0; t < n; t++) {
      const status = p.status === "completed" ? "done" : weighted([["done", 3], ["in_progress", 3], ["todo", 3], ["review", 1.2], ["testing", 1]]);
      const assignee = pick(emp);
      tasks.push({
        _id: `demo-task-${tasks.length + 1}`, taskCode: `${p.projectCode}-T${t + 1}`, projectId: p._id, parentTaskId: null, title: TASKS[(pi + t) % TASKS.length], description: "Scoped in the sprint planning session; acceptance criteria are in the project brief.", status,
        priority: pick(["low", "medium", "high", "medium", "critical"]), assigneeId: assignee._id, labels: [pick(["backend", "frontend", "design", "qa", "devops"])], startDate: dayAgo(rint(5, 60)), dueDate: dayAhead(rint(-15, 40)), estimateHours: pick([4, 8, 12, 16, 24]), orderKey: (t + 1) * 1000,
        completedAt: status === "done" ? ago(rint(1, 30)) : null, ...audit(ago(rint(10, 80))),
      });
    }
  }

  // team, timesheets and comments for the demo projects
  const members = [];
  const timesheets = [];
  const comments = [];
  const projectMembers = new Map();
  for (const p of pms.projects) {
    const team = shuffle(emp).slice(0, rint(3, 5));
    // the super admin (linked to demo-emp-1) sits on every project team so Messenger keeps them in every project channel
    const adminEmp = emp.find((e) => e._id === "demo-emp-1");
    if (adminEmp && !team.some((e) => e._id === adminEmp._id)) team.push(adminEmp);
    projectMembers.set(p._id, team);
    team.forEach((e, k) => members.push({ _id: `demo-pm-${members.length + 1}`, projectId: p._id, employeeId: e._id, role: k === 0 ? "manager" : pick(["lead", "developer", "developer", "designer", "qa", "analyst"]), allocationPercent: pick([25, 50, 75, 100]), billableRate: pick([1200, 1800, 2400, 3000]), costRate: pick([600, 900, 1200]), active: true, ...audit(ago(rint(20, 200))) }));
  }
  for (const t of tasks) {
    const team = projectMembers.get(t.projectId) ?? emp;
    if (t.status === "todo") continue;
    for (let k = 0; k < rint(1, 3); k++) {
      const e = pick(team);
      const hours = pick([1.5, 2, 3, 4, 6, 8]);
      timesheets.push({ _id: `demo-ts-${timesheets.length + 1}`, projectId: t.projectId, taskId: t._id, employeeId: e._id, date: dayAgo(rint(1, 45)), startTime: "10:00", endTime: null, hours, description: `Worked on ${t.title.toLowerCase()}`, billable: chance(0.85), status: weighted([["approved", 6], ["submitted", 2], ["draft", 1]]), submittedAt: ago(rint(1, 30)), reviewedBy: null, reviewedAt: null, reviewNote: null, ...audit(ago(rint(1, 45))) });
    }
    if (chance(0.3)) comments.push({ _id: `demo-tc-${comments.length + 1}`, taskId: t._id, projectId: t.projectId, authorId: pick(emp).adminUserId ?? "demo", authorEmail: pick(emp).workEmail, body: pick(["Looks good — moving to review.", "Blocked on client input, will follow up.", "PR raised, please review.", "Estimate updated after scoping."]), createdAt: ago(rint(1, 30)), editedAt: null, deletedAt: null });
  }

  for (const c of ["prms_vendors", "prms_requisitions", "prms_purchase_orders", "prms_assets", "pms_tasks", "pms_project_members", "pms_timesheets", "pms_task_comments"]) await wipe(c);
  await db.collection("prms_purchase_orders").deleteMany({ items: { $exists: false } });
  await db.collection("prms_assets").deleteMany({ depreciationMethod: { $exists: false } });
  await db.collection("prms_vendors").deleteMany({ bankDetails: { $exists: false } });
  await db.collection("prms_requisitions").deleteMany({ approvals: { $exists: false } });
  await db.collection("prms_vendors").deleteMany({ vendorCode: { $exists: false } });
  await db.collection("prms_requisitions").deleteMany({ prCode: { $exists: false } });
  await db.collection("prms_purchase_orders").deleteMany({ poNumber: { $exists: false } });
  await db.collection("prms_assets").deleteMany({ assetCode: { $exists: false } });
  await insertAll(db.collection("prms_vendors"), vendors);
  await insertAll(db.collection("prms_requisitions"), requisitions);
  await insertAll(db.collection("prms_purchase_orders"), orders);
  await insertAll(db.collection("prms_assets"), assets);
  await insertAll(db.collection("pms_tasks"), tasks);
  await insertAll(db.collection("pms_project_members"), members);
  await insertAll(db.collection("pms_timesheets"), timesheets);
  await insertAll(db.collection("pms_task_comments"), comments);
  console.log(`  ✓ PRMS/PMS: ${vendors.length} vendors, ${requisitions.length} requisitions, ${orders.length} purchase orders, ${assets.length} assets, ${tasks.length} project tasks, ${members.length} team members, ${timesheets.length} timesheet entries`);
}
