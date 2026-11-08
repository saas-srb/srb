/**
 * Seeded business data for the AI Intelligence tests and the demo seeder. Every
 * document is typed against the owning product's own interface, so a renamed
 * field breaks compilation here. Amounts are in rupees. Dates are relative to
 * "today" in Asia/Kolkata, so the examples (this month, this year, delayed …)
 * stay true whenever it runs.
 */
import { getDb } from "@/lib/mongodb";
import { addDays, isoDay, zonedDayStart } from "@/lib/products/databrain-ai/dates";
import type { Client } from "@/lib/products/sprintos/clients";
import type { Project } from "@/lib/products/sprintos/projects";
import type { ProjectMember } from "@/lib/products/sprintos/project-members";
import type { Task } from "@/lib/products/sprintos/tasks";
import type { TimesheetEntry } from "@/lib/products/sprintos/timesheets";
import type { Employee } from "@/lib/products/talentos/employees";
import type { Department } from "@/lib/products/talentos/departments";
import type { LeaveRequest } from "@/lib/products/talentos/leave";
import type { LeadRecord } from "@/lib/lead-management/types";
import type { Invoice } from "@/lib/products/cashflow-ai/invoices";
import type { Receipt } from "@/lib/products/cashflow-ai/receipts";
import type { Expense } from "@/lib/products/spendiq/expenses";
import type { Vendor } from "@/lib/products/spendiq/vendors";
import type { PurchaseOrder } from "@/lib/products/spendiq/purchase-orders";

export const TZ = "Asia/Kolkata";
export const today = isoDay(new Date(), TZ);
export const Y = Number(today.slice(0, 4));
export const monthStart = `${today.slice(0, 7)}-01`;
export const monthEnd = (() => {
  const [y, m] = today.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`;
})();
export const lastMonthEnd = addDays(monthStart, -1);
export const lastMonth = lastMonthEnd.slice(0, 7);
export const REVENUE_STATUSES = ["sent", "partially_paid", "paid", "overdue"];

const stamp = { createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null, deletedAt: null };
const gone = { ...stamp, deletedAt: new Date() };

export type Fixture = { c: Client[]; p: Project[]; m: ProjectMember[]; t: Task[]; ts: TimesheetEntry[]; e: Employee[]; d: Department[]; lv: LeaveRequest[]; l: LeadRecord[]; i: Invoice[]; r: Receipt[]; x: Expense[]; v: Vendor[]; po: PurchaseOrder[] };

/** Typed against the products' own interfaces, so a renamed field breaks compilation here. */
export function fixture(tag: string, k: { amount: number; extraActive: number }): Fixture {
  const id = (s: string) => `${tag}-${s}`;
  const contact = { name: "X", email: "x@example.com", phone: "1", designation: null };
  const billing = { addressLine: null, city: null, country: "India", gstin: null, currency: "INR", paymentTermsDays: 30 };
  const client = (n: string, name: string, status: Client["status"], industry: string, extra: Partial<Client> = {}): Client => ({ ...stamp, _id: id(n), clientCode: `CLI-${n}`, companyName: name, industry, website: null, status, primaryContact: contact, billing, notes: null, tags: [], ...extra });
  const proj = (n: string, name: string, status: Project["status"], endDate: string | null, clientId: string, extra: Partial<Project> = {}): Project => ({ ...stamp, _id: id(n), projectCode: `PRJ-${n}`, name, clientId, category: "Web", description: null, priority: "medium", status, startDate: "2025-01-01", endDate, estimatedBudget: 500000, estimatedHours: 100, currency: "INR", projectManagerId: id("e1"), technologies: [], progressPercent: 40, ...extra });
  const personal = { dateOfBirth: null, gender: null, maritalStatus: null, personalEmail: "p@example.com", phone: "999", addressLine: null, city: null, state: null, postalCode: null, photoKey: null };
  const prof = (departmentId: string, joiningDate: string, extra: Partial<Employee["professional"]> = {}): Employee["professional"] => ({ departmentId, designationId: null, teamId: null, reportingManagerId: null, employmentType: "full_time", workLocation: "Pune", joiningDate, probationEndDate: null, relievingDate: null, ...extra });
  const emp = (n: string, first: string, last: string, status: Employee["status"], professional: Employee["professional"], extra: Partial<Employee> = {}): Employee => ({ ...stamp, _id: id(n), employeeCode: `YO-${n}`, firstName: first, lastName: last, workEmail: `${first.toLowerCase()}@x.test`, status, personal, professional, emergencyContacts: [], recruitment: null, adminUserId: null, ...extra });
  const inv = (n: string, customer: string, customerId: string, status: Invoice["status"], invoiceDate: string, dueDate: string, total: number, paid: number, extra: Partial<Invoice> = {}): Invoice => ({ ...stamp, _id: id(n), invoiceNumber: `INV-${tag}-${n}`, customerId, customerName: customer, projectId: null, invoiceDate, dueDate, items: [], discount: 0, subtotal: total, taxAmount: 0, totalAmount: total, amountPaid: paid, amountCredited: 0, currency: "INR", paymentTerms: null, poNumber: null, status, notes: null, ...extra });
  const A = k.amount;
  const exp = (n: string, projectId: string | null, projectName: string | null, amount: number, status: Expense["approvalStatus"], date: string, extra: Partial<Expense> = {}): Expense => ({ ...stamp, _id: id(n), expenseCode: `EXP-${n}`, category: "Travel", subcategory: null, vendorId: null, vendorName: null, departmentId: null, departmentName: null, projectId, projectName, amount, gstRate: 18, gstAmount: amount * 0.18, totalAmount: amount * 1.18, currency: "INR", paymentMethod: "upi", invoiceNumber: null, invoiceStorageKey: null, invoiceFilename: null, expenseDate: new Date(`${date}T05:30:00Z`), description: "secret trip", expenseType: "one_time", recurrence: null, parentExpenseId: null, approvalStatus: status, approvedBy: null, approvedAt: null, rejectionReason: null, raisedByUserId: "u", raisedByName: "Someone", ...extra });
  const lead = (n: string, source: LeadRecord["source"], status: LeadRecord["status"], extra: Partial<LeadRecord> = {}): LeadRecord => ({ ...stamp, _id: id(n), code: `LEAD-${n}`, type: "client", source, name: `Lead ${n}`, email: "lead@example.com", phone: "1", subService: null, message: "please call", stage: "new_inquiry", stageEnteredAt: new Date(), status, externalUserId: "x", ownerStaffId: null, hasUnreadPortalReply: false, sourceRef: null, applicationId: null, offerId: null, studentId: null, clientId: null, projectId: null, ...extra });
  return {
    c: [client("c1", "Acme Corp", "active", "Retail"), client("c2", "Beta Ltd", "active", "Finance"), client("c3", "Gamma Inc", "inactive", "Retail"), client("c4", "Deleted Co", "active", "Retail", gone), ...Array.from({ length: k.extraActive }, (_, n) => client(`cx${n}`, `Extra ${n}`, "active", "Other"))],
    p: [
      proj("p1", "Website Redesign", "in_progress", addDays(today, -10), id("c1")),
      proj("p2", "Mobile App", "planning", addDays(today, 30), id("c2")),
      proj("p3", "Old Migration", "completed", addDays(today, -100), id("c1")),
      proj("p4", "ERP Rollout", "review", addDays(today, -1), id("c1")),
      proj("p5", "Parked", "on_hold", addDays(today, -50), id("c3")),
    ],
    m: [
      { ...stamp, _id: id("m1"), projectId: id("p1"), employeeId: id("e1"), role: "developer", allocationPercent: 50, billableRate: 900, costRate: 400, active: true },
      { ...stamp, _id: id("m2"), projectId: id("p1"), employeeId: id("e2"), role: "qa", allocationPercent: 30, billableRate: 700, costRate: 300, active: true },
      { ...stamp, _id: id("m3"), projectId: id("p1"), employeeId: id("e4"), role: "designer", allocationPercent: 10, billableRate: null, costRate: null, active: false },
      { ...stamp, _id: id("m4"), projectId: id("p2"), employeeId: id("e3"), role: "manager", allocationPercent: 100, billableRate: null, costRate: null, active: true },
      { ...gone, _id: id("m5"), projectId: id("p1"), employeeId: id("e3"), role: "developer", allocationPercent: 10, billableRate: null, costRate: null, active: true },
    ],
    t: [
      { ...stamp, _id: id("t1"), taskCode: "TSK-1", projectId: id("p1"), parentTaskId: null, title: "Home page", description: null, status: "todo", priority: "high", assigneeId: id("e1"), labels: [], startDate: null, dueDate: addDays(today, -2), estimateHours: 8, orderKey: 1, completedAt: null },
      { ...stamp, _id: id("t2"), taskCode: "TSK-2", projectId: id("p1"), parentTaskId: null, title: "Done", description: null, status: "done", priority: "low", assigneeId: id("e1"), labels: [], startDate: null, dueDate: addDays(today, -5), estimateHours: 2, orderKey: 2, completedAt: new Date() },
      { ...stamp, _id: id("t3"), taskCode: "TSK-3", projectId: id("p2"), parentTaskId: null, title: "Later", description: null, status: "in_progress", priority: "medium", assigneeId: id("e3"), labels: [], startDate: null, dueDate: addDays(today, 20), estimateHours: 4, orderKey: 3, completedAt: null },
    ],
    ts: [
      { ...stamp, _id: id("ts1"), projectId: id("p1"), taskId: null, employeeId: id("e1"), date: `${monthStart}`, startTime: null, endTime: null, hours: 6.5, description: "private", billable: true, status: "approved", submittedAt: null, reviewedBy: null, reviewedAt: null, reviewNote: null },
      { ...stamp, _id: id("ts2"), projectId: id("p1"), taskId: null, employeeId: id("e2"), date: `${monthStart}`, startTime: null, endTime: null, hours: 3.5, description: null, billable: false, status: "submitted", submittedAt: null, reviewedBy: null, reviewedAt: null, reviewNote: null },
    ],
    e: [
      emp("e1", "Asha", "Menon", "active", prof(id("d1"), `${Y}-01-02`)),
      emp("e2", "Ravi", "Rao", "active", prof(id("d1"), `${Y - 1}-06-15`)),
      emp("e3", "Meera", "Nair", "probation", prof(id("d2"), `${Y}-01-10`)),
      emp("e4", "Left", "Company", "relieved", prof(id("d1"), `${Y - 1}-02-01`, { relievingDate: `${Y}-01-31` })),
      emp("e5", "Ghost", "Deleted", "active", prof(id("d1"), `${Y}-01-05`), gone),
    ],
    d: [
      { ...stamp, _id: id("d1"), name: "Engineering", code: "ENG", description: null, headEmployeeId: null },
      { ...stamp, _id: id("d2"), name: "Sales", code: "SAL", description: null, headEmployeeId: null },
    ],
    lv: [
      { ...stamp, _id: id("lv1"), employeeId: id("e1"), leaveTypeCode: "casual", startDate: today, endDate: today, halfDayStart: false, halfDayEnd: false, days: 1, reason: "medical", status: "pending", appliedBy: null, decidedBy: null, decidedAt: null, decisionNote: null },
      { ...stamp, _id: id("lv2"), employeeId: id("e2"), leaveTypeCode: "sick", startDate: today, endDate: today, halfDayStart: false, halfDayEnd: false, days: 2, reason: "flu", status: "approved", appliedBy: null, decidedBy: null, decidedAt: null, decisionNote: null },
    ],
    l: [lead("l1", "job_portal", "open"), lead("l2", "job_portal", "won"), lead("l3", "software_development", "open"), lead("l4", "software_development", "open"), lead("l5", "software_development", "lost"), lead("l6", "manual", "open"), lead("l7", "manual", "open", gone)],
    i: [
      inv("i1", "Acme Corp", id("c1"), "paid", monthStart, addDays(monthStart, 14), 100000 * A, 100000 * A, { projectId: id("p1") }),
      inv("i2", "Beta Ltd", id("c2"), "partially_paid", monthStart, `${lastMonth}-20`, 50000 * A, 20000 * A),
      inv("i3", "Acme Corp", id("c1"), "draft", monthStart, addDays(monthStart, 14), 7000 * A, 0),
      inv("i4", "Acme Corp", id("c1"), "paid", `${lastMonth}-15`, `${lastMonth}-28`, 80000 * A, 80000 * A),
      inv("i5", "Gamma Inc", id("c3"), "sent", `${lastMonth}-10`, `${lastMonth}-25`, 20000 * A, 0),
      inv("i6", "Beta Ltd", id("c2"), "paid", `${Y}-01-05`, `${Y}-01-20`, 10000.55 * A, 10000.55 * A),
      inv("i7", "Acme Corp", id("c1"), "cancelled", monthStart, addDays(monthStart, 14), 3000 * A, 0),
      inv("i8", "Acme Corp", id("c1"), "paid", monthStart, addDays(monthStart, 14), 99999 * A, 99999 * A, gone),
      inv("i9", "Acme Corp", id("c1"), "sent", `${Y - 1}-03-01`, `${Y - 1}-03-15`, 5000 * A, 0),
    ],
    r: [
      { ...stamp, _id: id("r1"), receiptNumber: "REC-1", customerId: id("c1"), customerName: "Acme Corp", receiptDate: zonedDayStart(monthStart, TZ), amount: 100000 * A, method: "bank_transfer", transactionReference: "UTR1", allocations: [], advanceAmount: 0, currency: "INR", status: "completed", transactionId: null, notes: null }, // 00:00 IST on the 1st
      { ...stamp, _id: id("r2"), receiptNumber: "REC-2", customerId: id("c2"), customerName: "Beta Ltd", receiptDate: new Date(zonedDayStart(monthStart, TZ).getTime() - 30 * 60_000), amount: 20000 * A, method: "upi", transactionReference: null, allocations: [], advanceAmount: 0, currency: "INR", status: "completed", transactionId: null, notes: null }, // 23:30 IST on the last day of last month
      { ...stamp, _id: id("r3"), receiptNumber: "REC-3", customerId: id("c2"), customerName: "Beta Ltd", receiptDate: zonedDayStart(monthStart, TZ), amount: 1 * A, method: "cash", transactionReference: null, allocations: [], advanceAmount: 0, currency: "INR", status: "voided", transactionId: null, notes: null },
    ],
    x: [
      exp("x1", id("p1"), "Website Redesign", 12000 * A, "approved", monthStart),
      exp("x2", id("p1"), "Website Redesign", 5000 * A, "reimbursed", `${lastMonth}-12`),
      exp("x3", id("p2"), "Mobile App", 8000 * A, "approved", monthStart),
      exp("x4", null, null, 3000 * A, "approved", monthStart),
      exp("x5", id("p1"), "Website Redesign", 999 * A, "rejected", monthStart),
    ],
    v: [vendorDoc(tag, "v1", "Cloud One", "cloud_provider", "active"), vendorDoc(tag, "v2", "Desk Co", "furniture_vendor", "active"), vendorDoc(tag, "v3", "Old Vendor", "other", "inactive")],
    po: [
      poDoc(tag, "po1", id("v1"), "Cloud One", "issued", 40000 * A),
      poDoc(tag, "po2", id("v2"), "Desk Co", "received", 10000 * A),
    ],
  };
}

function vendorDoc(tag: string, n: string, name: string, category: Vendor["category"], status: Vendor["status"]): Vendor {
  return { ...stamp, _id: `${tag}-${n}`, vendorCode: `VEN-${n}`, companyName: name, gstin: "27AAAAA0000A1Z5", pan: "AAAAA0000A", contactPerson: "Private Person", email: "v@example.com", phone: "123", addressLine: null, city: "Pune", state: null, pincode: null, bankDetails: { accountName: "n", accountNumber: "1234567890", ifsc: "HDFC0000001", bankName: "HDFC", branch: null }, paymentTerms: "net_30", currency: "INR", category, rating: 4.5, status, notes: null };
}
function poDoc(tag: string, n: string, vendorId: string, vendorName: string, status: PurchaseOrder["status"], total: number): PurchaseOrder {
  return { ...stamp, _id: `${tag}-${n}`, poNumber: `PO-${n}`, vendorId, vendorName, requisitionId: null, rfqId: null, departmentId: null, departmentName: "Engineering", projectId: `${tag}-p1`, projectName: "Website Redesign", items: [], subtotal: total, discount: 0, taxableAmount: total, gstAmount: 0, totalAmount: total, currency: "INR", deliveryAddress: null, deliveryDate: addDays(today, 10), paymentTerms: null, notes: null, status, issuedAt: new Date() };
}

export async function seed(tag: string, k: { amount: number; extraActive: number }) {
  const d = await getDb();
  const f = fixture(tag, k);
  await Promise.all([
    d.collection("pms_clients").insertMany(f.c as never[]),
    d.collection("pms_projects").insertMany(f.p as never[]),
    d.collection("pms_project_members").insertMany(f.m as never[]),
    d.collection("pms_tasks").insertMany(f.t as never[]),
    d.collection("pms_timesheets").insertMany(f.ts as never[]),
    d.collection("hrms_employees").insertMany(f.e as never[]),
    d.collection("hrms_departments").insertMany(f.d as never[]),
    d.collection("hrms_leave_requests").insertMany(f.lv as never[]),
    d.collection("lead_records").insertMany(f.l as never[]),
    d.collection("fms_invoices").insertMany(f.i as never[]),
    d.collection("fms_receipts").insertMany(f.r as never[]),
    d.collection("prms_expenses").insertMany(f.x as never[]),
    d.collection("prms_vendors").insertMany(f.v as never[]),
    d.collection("prms_purchase_orders").insertMany(f.po as never[]),
  ]);
  return f;
}

