import "server-only";
import { CLIENTS_COLLECTION } from "@/lib/products/sprintos/clients";
import { PROJECTS_COLLECTION } from "@/lib/products/sprintos/projects";
import { MEMBERS_COLLECTION } from "@/lib/products/sprintos/project-members";
import { TASKS_COLLECTION } from "@/lib/products/sprintos/tasks";
import { TIMESHEETS_COLLECTION } from "@/lib/products/sprintos/timesheets";
import { EMPLOYEES_COLLECTION } from "@/lib/products/talentos/employees";
import { DEPARTMENTS_COLLECTION } from "@/lib/products/talentos/departments";
import { LEAVE_REQUESTS_COLLECTION } from "@/lib/products/talentos/leave";
import { LEAD_RECORDS_COLLECTION } from "@/lib/lead-management/records";
import { INVOICES_COLLECTION } from "@/lib/products/cashflow-ai/invoices";
import { RECEIPTS_COLLECTION } from "@/lib/products/cashflow-ai/receipts";
import { EXPENSES_COLLECTION } from "@/lib/products/spendiq/expenses";
import { VENDORS_COLLECTION } from "@/lib/products/spendiq/vendors";
import { PURCHASE_ORDERS_COLLECTION } from "@/lib/products/spendiq/purchase-orders";
import { ACTIVE_PROJECT_STATUSES, CLIENT_STATUSES, PRIORITIES, PROJECT_MEMBER_ROLES, PROJECT_STATUSES, TASK_STATUSES, TIMESHEET_STATUSES } from "@/lib/products/sprintos/constants";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES } from "@/lib/products/talentos/employee-status";
import { LEAVE_REQUEST_STATUSES } from "@/lib/products/talentos/leave-status";
import { LEAD_SOURCE_META } from "@/lib/lead-management/types";
import { INVOICE_STATUSES, PAYMENT_METHODS } from "@/lib/products/cashflow-ai/constants";
import { EXPENSE_STATUSES, PO_STATUSES, VENDOR_CATEGORIES, VENDOR_STATUSES } from "@/lib/products/spendiq/constants";
import type { EntityDef, EntityInput, EnumValue, FieldDef, FieldInput } from "@/lib/products/databrain-ai/catalog/types";

/**
 * THE semantic layer: every business entity the AI Data Analyst can query.
 * Platform-level and company-independent. A new entity is one entry here and
 * nothing else — the validator, translator, access rules and the model's
 * catalog all read this registry. Field paths and enum values are taken from
 * each product's own code (collection constants, status lists) so they cannot
 * drift; `scripts/test-intelligence-planner.ts` checks the rest against real
 * documents.
 *
 * Conventions that hold for every entity here:
 *  - Money is stored in MAJOR units (rupees) everywhere in these products — never paise.
 *    (Wallet/billing amounts are in paise, but no wallet or billing entity is exposed.)
 *  - Dates are either BSON Dates (`storage: "date"`) or "yyyy-mm-dd" strings (`"isoDate"`); the query layer handles both.
 *  - Relations are many-to-one (child → parent) so joins never multiply rows.
 *  - Free-text, contact, identity, bank and cost-rate fields are `sensitive` and never offered to the model.
 */

const ev = (list: readonly { value: string; label: string }[]): EnumValue[] => list.map(({ value, label }) => ({ value, label }));
const NOT_DELETED = { deletedAt: null };

const DEFAULTS_BY_TYPE: Record<FieldDef["type"], Pick<FieldDef, "filterable" | "groupable" | "aggregatable">> = {
  string: { filterable: true, groupable: true, aggregatable: false },
  enum: { filterable: true, groupable: true, aggregatable: false },
  id: { filterable: true, groupable: true, aggregatable: false },
  number: { filterable: true, groupable: false, aggregatable: true },
  money: { filterable: true, groupable: false, aggregatable: true },
  date: { filterable: true, groupable: true, aggregatable: true },
  boolean: { filterable: true, groupable: true, aggregatable: false },
};

function field(input: FieldInput): FieldDef {
  const d = DEFAULTS_BY_TYPE[input.type];
  const out: FieldDef = {
    key: input.key,
    path: input.path ?? input.key,
    label: input.label,
    type: input.type,
    filterable: input.filterable ?? d.filterable,
    groupable: input.groupable ?? d.groupable,
    aggregatable: input.aggregatable ?? d.aggregatable,
    sensitive: input.sensitive ?? false,
    ...(input.description ? { description: input.description } : {}),
    ...(input.enumValues ? { enumValues: input.enumValues } : {}),
    ...(input.liveValues ? { liveValues: true } : {}),
    ...(input.expr ? { expr: input.expr } : {}),
  };
  if (input.type === "date") out.storage = input.storage ?? "date";
  if (input.type === "money") out.unit = input.unit ?? "rupees";
  return out;
}

function entity(input: EntityInput): EntityDef {
  return { ...input, baseFilter: input.baseFilter ?? NOT_DELETED, fields: input.fields.map(field) };
}

const str = (key: string, label: string, o: Partial<FieldInput> = {}): FieldInput => ({ key, label, type: "string", ...o });
const id = (key: string, label: string, o: Partial<FieldInput> = {}): FieldInput => ({ key, label, type: "id", groupable: true, ...o });
const num = (key: string, label: string, o: Partial<FieldInput> = {}): FieldInput => ({ key, label, type: "number", ...o });
const money = (key: string, label: string, o: Partial<FieldInput> = {}): FieldInput => ({ key, label, type: "money", ...o });
const bool = (key: string, label: string, o: Partial<FieldInput> = {}): FieldInput => ({ key, label, type: "boolean", ...o });
const en = (key: string, label: string, list: readonly { value: string; label: string }[], o: Partial<FieldInput> = {}): FieldInput => ({ key, label, type: "enum", enumValues: ev(list), ...o });
const date = (key: string, label: string, o: Partial<FieldInput> = {}): FieldInput => ({ key, label, type: "date", ...o });
/** A "yyyy-mm-dd" string date. */
const day = (key: string, label: string, o: Partial<FieldInput> = {}): FieldInput => date(key, label, { storage: "isoDate", ...o });
const secret = (key: string, label: string, type: FieldInput["type"] = "string", o: Partial<FieldInput> = {}): FieldInput => ({ key, label, type, sensitive: true, filterable: false, groupable: false, aggregatable: false, ...o });

const lit = (v: string) => ({ $literal: v });
const OPEN_INVOICE = ["sent", "partially_paid", "overdue"];
const balanceExpr = { $round: [{ $subtract: [{ $ifNull: ["$totalAmount", 0] }, { $add: [{ $ifNull: ["$amountPaid", 0] }, { $ifNull: ["$amountCredited", 0] }] }] }, 2] };

/** Directory view of employees that PMS staff already see (names on project teams, task assignees, timesheets). */
const EMPLOYEE_DIRECTORY = ["employeeCode", "firstName", "lastName"] as const;

export const ENTITIES: readonly EntityDef[] = [
  // ── Projects (PMS) ─────────────────────────────────────────────────────────
  entity({
    key: "clients",
    label: "Clients",
    description: "Client companies (customers). A client is 'active' when status = active. Contact people, emails, phones and tax ids are not available.",
    collection: CLIENTS_COLLECTION,
    module: "pms",
    dateField: "createdAt",
    access: [{ area: "clients" }],
    relations: [],
    fields: [
      str("clientCode", "Client code"),
      str("companyName", "Client name"),
      str("industry", "Industry", { liveValues: true }),
      en("status", "Status", CLIENT_STATUSES),
      str("country", "Country", { path: "billing.country", liveValues: true }),
      str("currency", "Billing currency", { path: "billing.currency", liveValues: true }),
      date("createdAt", "Created"),
      secret("contactEmail", "Contact email", "string", { path: "primaryContact.email" }),
      secret("contactPhone", "Contact phone", "string", { path: "primaryContact.phone" }),
      secret("gstin", "GSTIN", "string", { path: "billing.gstin" }),
      secret("notes", "Notes"),
    ],
  }),
  entity({
    key: "projects",
    label: "Projects",
    description:
      "Projects. 'Active' = status in planning, in_progress, review, testing. 'Delayed'/'overdue' = isDelayed true (active and endDate before today). estimatedBudget is the planned budget, not spend (spend is in expenses).",
    collection: PROJECTS_COLLECTION,
    module: "pms",
    dateField: "createdAt",
    access: [{ area: "projects" }],
    relations: [
      { key: "client", to: "clients", localField: "clientId", foreignField: "_id", label: "Client" },
      { key: "manager", to: "employees", localField: "projectManagerId", foreignField: "_id", label: "Project manager" },
    ],
    fields: [
      str("projectCode", "Project code"),
      str("name", "Project name"),
      str("category", "Category", { liveValues: true }),
      en("priority", "Priority", PRIORITIES),
      en("status", "Status", PROJECT_STATUSES),
      day("startDate", "Start date"),
      day("endDate", "End (due) date"),
      money("estimatedBudget", "Estimated budget"),
      num("estimatedHours", "Estimated hours"),
      num("progressPercent", "Progress %"),
      str("currency", "Currency", { liveValues: true }),
      id("clientId", "Client id"),
      id("projectManagerId", "Project manager id"),
      date("createdAt", "Created"),
      bool("isDelayed", "Is delayed (active and past its end date)", {
        expr: ({ today }) => ({ $and: [{ $in: ["$status", ACTIVE_PROJECT_STATUSES] }, { $ne: [{ $ifNull: ["$endDate", null] }, null] }, { $lt: ["$endDate", lit(today)] }] }),
      }),
    ],
  }),
  entity({
    key: "project_members",
    label: "Project team members",
    description: "Which employees are assigned to which project (one row per assignment). Start here for 'who works on project X' and join project and employee.",
    collection: MEMBERS_COLLECTION,
    module: "pms",
    dateField: "createdAt",
    access: [{ area: "projects" }],
    relations: [
      { key: "project", to: "projects", localField: "projectId", foreignField: "_id", label: "Project" },
      { key: "employee", to: "employees", localField: "employeeId", foreignField: "_id", label: "Employee" },
    ],
    fields: [
      id("projectId", "Project id"),
      id("employeeId", "Employee id"),
      en("role", "Role on the project", PROJECT_MEMBER_ROLES),
      num("allocationPercent", "Allocation %"),
      bool("active", "Active assignment"),
      date("createdAt", "Assigned on"),
      secret("billableRate", "Billable rate", "money"),
      secret("costRate", "Cost rate", "money"),
    ],
  }),
  entity({
    key: "tasks",
    label: "Tasks",
    description: "Project tasks. 'Open' = status other than done. 'Overdue' = isOverdue true (not done and past dueDate).",
    collection: TASKS_COLLECTION,
    module: "pms",
    dateField: "createdAt",
    access: [{ area: "tasks" }],
    relations: [
      { key: "project", to: "projects", localField: "projectId", foreignField: "_id", label: "Project" },
      { key: "assignee", to: "employees", localField: "assigneeId", foreignField: "_id", label: "Assignee" },
    ],
    fields: [
      str("taskCode", "Task code"),
      str("title", "Title"),
      en("status", "Status", TASK_STATUSES),
      en("priority", "Priority", PRIORITIES),
      id("projectId", "Project id"),
      id("assigneeId", "Assignee id"),
      day("startDate", "Start date"),
      day("dueDate", "Due date"),
      num("estimateHours", "Estimated hours"),
      date("completedAt", "Completed at"),
      date("createdAt", "Created"),
      bool("isOverdue", "Is overdue (not done and past due date)", {
        expr: ({ today }) => ({ $and: [{ $ne: ["$status", "done"] }, { $ne: [{ $ifNull: ["$dueDate", null] }, null] }, { $lt: ["$dueDate", lit(today)] }] }),
      }),
    ],
  }),
  entity({
    key: "timesheets",
    label: "Timesheets",
    description: "Hours logged by employees against projects (one row per entry). Approved/submitted hours are the costed ones.",
    collection: TIMESHEETS_COLLECTION,
    module: "pms",
    dateField: "date",
    access: [{ area: "timesheets" }],
    relations: [
      { key: "project", to: "projects", localField: "projectId", foreignField: "_id", label: "Project" },
      { key: "employee", to: "employees", localField: "employeeId", foreignField: "_id", label: "Employee" },
    ],
    fields: [
      id("projectId", "Project id"),
      id("employeeId", "Employee id"),
      id("taskId", "Task id"),
      day("date", "Work date"),
      num("hours", "Hours"),
      bool("billable", "Billable"),
      en("status", "Status", TIMESHEET_STATUSES),
      secret("description", "Description"),
    ],
  }),

  // ── People (HRMS) ─────────────────────────────────────────────────────────
  entity({
    key: "employees",
    label: "Employees",
    description:
      "Employees. 'Current/active staff' = status in probation, active, on_leave, notice_period. 'Joined' = joiningDate. No pay, bank, ids or personal contact data is available.",
    collection: EMPLOYEES_COLLECTION,
    module: "hrms",
    dateField: "createdAt",
    // HR (everything non-sensitive) — or people who see all projects / tasks / timesheets in PMS, who already see names on teams (directory fields only).
    access: [{ area: "employees" }, { area: "projects", fields: EMPLOYEE_DIRECTORY }, { area: "tasks", fields: EMPLOYEE_DIRECTORY }, { area: "timesheets", fields: EMPLOYEE_DIRECTORY }],
    relations: [{ key: "department", to: "departments", localField: "professional.departmentId", foreignField: "_id", label: "Department" }],
    fields: [
      str("employeeCode", "Employee code"),
      str("firstName", "First name"),
      str("lastName", "Last name"),
      en("status", "Status", EMPLOYEE_STATUSES),
      en("employmentType", "Employment type", EMPLOYMENT_TYPES, { path: "professional.employmentType" }),
      str("workLocation", "Work location", { path: "professional.workLocation", liveValues: true }),
      day("joiningDate", "Joining date", { path: "professional.joiningDate" }),
      day("relievingDate", "Relieving date", { path: "professional.relievingDate" }),
      id("departmentId", "Department id", { path: "professional.departmentId" }),
      date("createdAt", "Record created"),
      secret("workEmail", "Work email"),
      secret("personalEmail", "Personal email", "string", { path: "personal.personalEmail" }),
      secret("phone", "Phone", "string", { path: "personal.phone" }),
      secret("dateOfBirth", "Date of birth", "string", { path: "personal.dateOfBirth" }),
    ],
  }),
  entity({
    key: "departments",
    label: "Departments",
    description: "Company departments. Count employees per department by grouping employees on the department relation.",
    collection: DEPARTMENTS_COLLECTION,
    module: "hrms",
    dateField: "createdAt",
    access: [{ area: "employees" }],
    relations: [],
    fields: [str("name", "Department"), str("code", "Code"), date("createdAt", "Created")],
  }),
  entity({
    key: "leave_requests",
    label: "Leave requests",
    description: "Employee leave requests (one row per request). Reasons and decision notes are not available.",
    collection: LEAVE_REQUESTS_COLLECTION,
    module: "hrms",
    dateField: "startDate",
    access: [{ area: "leave" }],
    relations: [{ key: "employee", to: "employees", localField: "employeeId", foreignField: "_id", label: "Employee" }],
    fields: [
      id("employeeId", "Employee id"),
      str("leaveTypeCode", "Leave type", { liveValues: true }),
      day("startDate", "From"),
      day("endDate", "To"),
      num("days", "Days"),
      en("status", "Status", LEAVE_REQUEST_STATUSES),
      date("createdAt", "Requested on"),
      secret("reason", "Reason"),
      secret("decisionNote", "Decision note"),
    ],
  }),

  // ── CRM (leads) ───────────────────────────────────────────────────────────
  entity({
    key: "leads",
    label: "Leads",
    description:
      "Leads and inquiries (clients, job applicants, interns, trainees). 'Open' leads = status open; won/lost are the end states. source = where the lead came from; stage = current pipeline step. Names only — no emails, phones or messages.",
    collection: LEAD_RECORDS_COLLECTION,
    module: "lms",
    dateField: "createdAt",
    access: [{ area: "leads" }],
    relations: [],
    fields: [
      str("code", "Lead code"),
      str("name", "Name"),
      str("type", "Lead type", { liveValues: true }),
      en("source", "Source", Object.entries(LEAD_SOURCE_META).map(([value, m]) => ({ value, label: m.label }))),
      str("stage", "Stage", { liveValues: true }),
      en("status", "Status", [
        { value: "open", label: "Open" },
        { value: "won", label: "Won" },
        { value: "lost", label: "Lost" },
      ]),
      id("ownerStaffId", "Owner (staff id)"),
      date("createdAt", "Created"),
      date("stageEnteredAt", "Entered current stage"),
      secret("email", "Email"),
      secret("phone", "Phone"),
      secret("message", "Message"),
    ],
  }),

  // ── Finance (FMS) ─────────────────────────────────────────────────────────
  entity({
    key: "invoices",
    label: "Invoices",
    description:
      "Customer invoices (amounts in rupees). REVENUE: unless the user says collected/received/cash, revenue = invoiced amount = sum of totalAmount over invoices whose status is sent, partially_paid, paid or overdue (not draft, cancelled or void), by invoiceDate. " +
      "UNPAID/outstanding = status sent, partially_paid or overdue; the amount owed is `balance` (total minus paid minus credited). Overdue = isOverdue true. State which definition you used.",
    collection: INVOICES_COLLECTION,
    module: "fms",
    dateField: "invoiceDate",
    access: [{ area: "invoices" }],
    relations: [
      { key: "client", to: "clients", localField: "customerId", foreignField: "_id", label: "Client" },
      { key: "project", to: "projects", localField: "projectId", foreignField: "_id", label: "Project" },
    ],
    fields: [
      str("invoiceNumber", "Invoice number"),
      str("customerName", "Customer (client name)"),
      id("customerId", "Client id"),
      id("projectId", "Project id"),
      day("invoiceDate", "Invoice date"),
      day("dueDate", "Due date"),
      money("subtotal", "Subtotal"),
      money("discount", "Discount"),
      money("taxAmount", "Tax"),
      money("totalAmount", "Total amount"),
      money("amountPaid", "Amount paid"),
      money("amountCredited", "Amount credited"),
      en("status", "Status", INVOICE_STATUSES),
      str("currency", "Currency", { liveValues: true }),
      date("createdAt", "Created"),
      money("balance", "Balance due (total - paid - credited)", { expr: () => balanceExpr }),
      bool("isOverdue", "Is overdue (open, past due date, balance > 0)", {
        expr: ({ today }) => ({ $and: [{ $in: ["$status", OPEN_INVOICE] }, { $lt: ["$dueDate", lit(today)] }, { $gt: [balanceExpr, 0.01] }] }),
      }),
    ],
  }),
  entity({
    key: "receipts",
    label: "Payment receipts",
    description: "Money received from customers (amounts in rupees). COLLECTED/received/cash-in = sum of amount where status = completed, by receiptDate.",
    collection: RECEIPTS_COLLECTION,
    module: "fms",
    dateField: "receiptDate",
    access: [{ area: "invoices" }],
    relations: [{ key: "client", to: "clients", localField: "customerId", foreignField: "_id", label: "Client" }],
    fields: [
      str("receiptNumber", "Receipt number"),
      str("customerName", "Customer (client name)"),
      id("customerId", "Client id"),
      date("receiptDate", "Received on"),
      money("amount", "Amount received"),
      money("advanceAmount", "Unallocated advance"),
      en("method", "Payment method", PAYMENT_METHODS),
      en("status", "Status", [
        { value: "completed", label: "Completed" },
        { value: "voided", label: "Voided" },
      ]),
      str("currency", "Currency", { liveValues: true }),
      secret("transactionReference", "Transaction reference"),
    ],
  }),

  // ── Procurement & expenses (PRMS) ─────────────────────────────────────────
  entity({
    key: "expenses",
    label: "Expenses",
    description:
      "Operational expenses (amounts in rupees). Project-wise expense = group by projectName (projectId is null for expenses not tied to a project). amount excludes GST; totalAmount includes it. Count only approvalStatus approved or reimbursed as spent unless asked otherwise.",
    collection: EXPENSES_COLLECTION,
    module: "prms",
    dateField: "expenseDate",
    access: [{ area: "expenses" }],
    relations: [
      { key: "vendor", to: "vendors", localField: "vendorId", foreignField: "_id", label: "Vendor" },
      { key: "project", to: "projects", localField: "projectId", foreignField: "_id", label: "Project" },
    ],
    fields: [
      str("expenseCode", "Expense code"),
      str("category", "Category", { liveValues: true }),
      id("vendorId", "Vendor id"),
      str("vendorName", "Vendor name"),
      str("departmentName", "Department"),
      id("projectId", "Project id"),
      str("projectName", "Project name"),
      money("amount", "Amount (before GST)"),
      money("gstAmount", "GST"),
      money("totalAmount", "Total (with GST)"),
      str("currency", "Currency", { liveValues: true }),
      str("paymentMethod", "Payment method", { liveValues: true }),
      date("expenseDate", "Expense date"),
      en("approvalStatus", "Approval status", EXPENSE_STATUSES),
      en("expenseType", "Type", [
        { value: "one_time", label: "One time" },
        { value: "recurring", label: "Recurring" },
      ]),
      secret("description", "Description"),
      secret("raisedByName", "Raised by"),
    ],
  }),
  entity({
    key: "vendors",
    label: "Vendors",
    description: "Suppliers and service vendors. Contact details, tax ids and bank details are not available.",
    collection: VENDORS_COLLECTION,
    module: "prms",
    dateField: "createdAt",
    access: [{ area: "procurement" }],
    relations: [],
    fields: [
      str("vendorCode", "Vendor code"),
      str("companyName", "Vendor name"),
      en("category", "Category", VENDOR_CATEGORIES),
      en("status", "Status", VENDOR_STATUSES),
      num("rating", "Rating (0-5)"),
      str("city", "City", { liveValues: true }),
      date("createdAt", "Created"),
      secret("gstin", "GSTIN"),
      secret("pan", "PAN"),
      secret("email", "Email"),
      secret("phone", "Phone"),
      secret("contactPerson", "Contact person"),
      secret("bankAccountNumber", "Bank account number", "string", { path: "bankDetails.accountNumber" }),
      secret("bankIfsc", "Bank IFSC", "string", { path: "bankDetails.ifsc" }),
    ],
  }),
  entity({
    key: "purchase_orders",
    label: "Purchase orders",
    description: "Purchase orders to vendors (amounts in rupees). Open orders = status issued or partially_received.",
    collection: PURCHASE_ORDERS_COLLECTION,
    module: "prms",
    dateField: "createdAt",
    access: [{ area: "procurement" }],
    relations: [
      { key: "vendor", to: "vendors", localField: "vendorId", foreignField: "_id", label: "Vendor" },
      { key: "project", to: "projects", localField: "projectId", foreignField: "_id", label: "Project" },
    ],
    fields: [
      str("poNumber", "PO number"),
      id("vendorId", "Vendor id"),
      str("vendorName", "Vendor name"),
      id("projectId", "Project id"),
      str("projectName", "Project name"),
      str("departmentName", "Department"),
      money("subtotal", "Subtotal"),
      money("gstAmount", "GST"),
      money("totalAmount", "Total amount"),
      str("currency", "Currency", { liveValues: true }),
      en("status", "Status", PO_STATUSES),
      day("deliveryDate", "Delivery date"),
      date("issuedAt", "Issued at"),
      date("createdAt", "Created"),
    ],
  }),
];

const BY_KEY = new Map(ENTITIES.map((e) => [e.key, e]));
export const getEntityDef = (key: string): EntityDef | undefined => BY_KEY.get(key);
