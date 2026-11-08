/**
 * AI Intelligence: the semantic layer, the per-user catalog view, and the query
 * validator/translator — no OpenAI. Covers: the registry against real code, the
 * permission matrix, security cases (hidden entity/field, injection, caps,
 * read-only), every example question on seeded data, and tenant isolation.
 * Throwaway database, dropped at the end.
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27099/ai_test_$(date +%s) \
 *     npx --yes tsx --require ./scripts/lib/next-server-shims.cjs scripts/test-intelligence-planner.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getDb } from "@/lib/mongodb";
import { listPlans } from "@/lib/platform/billing/plans";
import { ENTITIES } from "@/lib/products/databrain-ai/catalog/registry";
import { buildCatalogView, clearCatalogStatsCache } from "@/lib/products/databrain-ai/catalog/view";
import { exampleQuestions } from "@/lib/products/databrain-ai/prompt";
import { runPlan, type QueryResult } from "@/lib/products/databrain-ai/query/execute";
import { validatePlan } from "@/lib/products/databrain-ai/query/validate";
import { translate, assertSafePipeline } from "@/lib/products/databrain-ai/query/translate";
import { LIMITS } from "@/lib/products/databrain-ai/query/plan";
import { addDays } from "@/lib/products/databrain-ai/dates";
import { REVENUE_STATUSES, TZ, Y, fixture, lastMonth, lastMonthEnd, monthEnd, monthStart, seed, today } from "./lib/intelligence-fixture";
import type { CatalogView } from "@/lib/products/databrain-ai/catalog/types";
import { createClient } from "@/lib/products/sprintos/clients";
import { createProject } from "@/lib/products/sprintos/projects";
import { createTask } from "@/lib/products/sprintos/tasks";
import { createEmployee } from "@/lib/products/talentos/employees";
import { createDepartment } from "@/lib/products/talentos/departments";
import { createInvoice } from "@/lib/products/cashflow-ai/invoices";
import { createExpense } from "@/lib/products/spendiq/expenses";
import { createVendor } from "@/lib/products/spendiq/vendors";
import { createLeadRecord } from "@/lib/lead-management/records";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const rows = (r: QueryResult) => r.rows;

const user = (roles: string[], permissionOverrides: Record<string, boolean> | null = null) => ({ roles, permissionOverrides });

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);
  const now = new Date();
  const A = randomUUID();
  const B = randomUUID();
  const STARTER = randomUUID();
  const NOPMS = randomUUID();
  const REAL = randomUUID();
  const company = (id: string, slug: string, extra: Record<string, unknown> = {}) => ({ _id: id as never, slug, name: slug, status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now, ...extra });
  await db.collection("companies").insertMany([company(A, "alpha"), company(B, "beta"), company(STARTER, "starter"), company(NOPMS, "nopms", { enabledModules: ["hrms", "lms", "fms"] }), company(REAL, "real")]);
  await listPlans();
  // Every real plan has every product; this test needs a plan without Finance and Procurement, so Starter is narrowed here (test database only).
  await db.collection("billing_plans").updateOne({ _id: "starter" as never }, { $set: { modules: ["hrms", "pms", "lms", "sop", "cms"] } });
  await db.collection("companies").updateOne({ _id: STARTER as never }, { $set: { subscription: { planId: "starter", status: "active", interval: "monthly", trialEndsAt: null, currentPeriodStart: now, currentPeriodEnd: null, cancelAtPeriodEnd: false, graceEndsAt: null, provider: null, updatedAt: now } } });

  const fa = await runAsCompany(A, () => seed("A", { amount: 1, extraActive: 0 }));
  await runAsCompany(B, () => seed("B", { amount: 10, extraActive: 3 }));
  await runAsCompany(STARTER, () => seed("S", { amount: 1, extraActive: 0 }));
  await runAsCompany(NOPMS, () => seed("N", { amount: 1, extraActive: 0 }));
  // A cross-company reference attempt: B's invoice points at A's client id.
  await runAsCompany(B, async () => (await getDb()).collection("fms_invoices").insertOne({ ...fixture("B", { amount: 10, extraActive: 0 }).i[0], _id: "B-xlink" as never, invoiceNumber: "INV-XLINK", customerId: "A-c1", customerName: "Linked to A", invoiceDate: monthStart } as never));

  const view = async (co: string, u: ReturnType<typeof user>): Promise<CatalogView> => {
    clearCatalogStatsCache();
    return runAsCompany(co, () => buildCatalogView(u));
  };
  const run = (co: string, v: CatalogView, plan: unknown) => runAsCompany(co, () => runPlan(v, plan, "q1"));
  const ok = async (co: string, v: CatalogView, plan: unknown): Promise<QueryResult> => {
    const r = await run(co, v, plan);
    assert.ok(r.ok, `plan should run: ${r.ok ? "" : r.error}`);
    return r.result;
  };
  const rejected = async (co: string, v: CatalogView, plan: unknown, code?: string) => {
    const r = await run(co, v, plan);
    assert.ok(!r.ok, "plan should be rejected");
    if (code) assert.equal(r.code, code, r.error);
    return r.error;
  };

  const admin = user(["super_admin"]);
  const vAdmin = await view(A, admin);

  console.log("registry");
  await check("keys unique; entities typed; collections are the products' own; relations resolve", () => {
    const keys = new Set<string>();
    for (const e of ENTITIES) {
      assert.ok(!keys.has(e.key), `duplicate entity ${e.key}`);
      keys.add(e.key);
      assert.ok(e.collection && e.module && e.label && e.description, e.key);
      assert.deepEqual(e.baseFilter, { deletedAt: null }, `${e.key} excludes soft-deleted rows`);
      assert.ok(e.access.length > 0, `${e.key} has an access rule`);
      const fkeys = new Set<string>();
      for (const f of e.fields) {
        assert.ok(!fkeys.has(f.key), `${e.key}.${f.key} duplicated`);
        fkeys.add(f.key);
        assert.ok(["string", "number", "money", "date", "boolean", "enum", "id"].includes(f.type));
        if (f.type === "enum") assert.ok(f.enumValues && f.enumValues.length > 0, `${e.key}.${f.key} enum values`);
        if (f.type === "money") assert.equal(f.unit, "rupees", `${e.key}.${f.key} money unit`);
        if (f.type === "date") assert.ok(f.storage === "date" || f.storage === "isoDate");
        if (f.sensitive) assert.ok(!f.filterable && !f.groupable && !f.aggregatable);
      }
      if (e.dateField) assert.ok(e.fields.some((f) => f.key === e.dateField && f.type === "date"), `${e.key} dateField`);
      for (const r of e.relations) {
        const target = ENTITIES.find((t) => t.key === r.to);
        assert.ok(target, `${e.key}.${r.key} -> ${r.to}`);
        assert.ok(e.fields.some((f) => f.path === r.localField), `${e.key}.${r.key} localField ${r.localField} is a registered path`);
        assert.equal(r.foreignField, "_id");
      }
      for (const g of e.access) for (const fk of g.fields ?? []) assert.ok(fkeys.has(fk), `${e.key} grant field ${fk}`);
    }
    for (const must of ["clients", "projects", "project_members", "tasks", "timesheets", "employees", "departments", "leave_requests", "leads", "invoices", "receipts", "expenses", "vendors", "purchase_orders"]) assert.ok(keys.has(must), must);
  });
  await check("secrets, contact data, bank/ids and cost rates are all marked sensitive", () => {
    const risky = /salary|payroll|password|hash|token|secret|bankd|accountnumber|ifsc|\bpan\b|gstin|aadhaar|phone|email|costrate|billablerate|dateofbirth|reason|decisionnote|message|notes|description|contactperson|raisedby|transactionreference/i;
    for (const e of ENTITIES) for (const f of e.fields) if (risky.test(f.key) || risky.test(f.path)) assert.ok(f.sensitive, `${e.key}.${f.key} must be sensitive`);
  });
  await check("every non-computed registry path exists in documents written by the products' real create functions", async () => {
    await runAsCompany(REAL, async () => {
      const actor = "tester";
      const dept = await createDepartment({ name: "Eng", code: "ENG" }, actor);
      const emp = await createEmployee({ firstName: "Real", lastName: "Person", workEmail: "real@x.test", status: "active", personal: { dateOfBirth: null, gender: null, maritalStatus: null, personalEmail: null, phone: null, addressLine: null, city: null, state: null, postalCode: null, photoKey: null }, professional: { departmentId: dept._id, designationId: null, teamId: null, reportingManagerId: null, employmentType: "full_time", workLocation: "Pune", joiningDate: today, probationEndDate: null, relievingDate: null }, emergencyContacts: [] }, actor);
      const cl = await createClient({ companyName: "Real Co", industry: "IT", website: null, status: "active", primaryContact: { name: "n", email: "a@b.c", phone: "1", designation: null }, billing: { addressLine: null, city: null, country: "India", gstin: null, currency: "INR", paymentTermsDays: 30 }, notes: null, tags: [] }, actor);
      const pr = await createProject({ name: "Real Project", clientId: cl._id, category: "Web", description: null, priority: "high", status: "in_progress", startDate: today, endDate: addDays(today, 5), estimatedBudget: 1000, estimatedHours: 10, currency: "INR", projectManagerId: emp._id, technologies: [], progressPercent: 10 }, actor);
      await createTask(pr._id, { title: "T", description: null, status: "todo", priority: "low", assigneeId: emp._id, labels: [], startDate: today, dueDate: today, estimateHours: 1, parentTaskId: null }, actor);
      await createInvoice({ customerId: cl._id, customerName: cl.companyName, projectId: pr._id, invoiceDate: today, dueDate: addDays(today, 10), items: [{ description: "x", quantity: 1, unitPrice: 100, taxRate: 18 }], discount: 0, currency: "INR", paymentTerms: null, poNumber: null, notes: null }, actor);
      await createExpense({ category: "Travel", subcategory: null, vendorId: null, vendorName: null, departmentId: null, departmentName: null, projectId: pr._id, projectName: pr.name, amount: 10, gstRate: 18, currency: "INR", paymentMethod: "upi", invoiceNumber: null, expenseDate: today, description: null, expenseType: "one_time" }, { userId: "u", name: "n" }, actor);
      await createVendor({ companyName: "Real Vendor", gstin: null, pan: null, contactPerson: null, email: null, phone: null, addressLine: null, city: "Pune", state: null, pincode: null, bankDetails: { accountName: null, accountNumber: null, ifsc: null, bankName: null, branch: null }, paymentTerms: "net_30", currency: "INR", category: "other", rating: null, status: "active", notes: null }, actor);
      await createLeadRecord({ type: "client", source: "manual", name: "Real Lead", email: "l@x.test", phone: "1", externalUserId: "ext", actorId: actor });
      const d = await getDb();
      const have = async (collection: string) => {
        const paths = new Set<string>();
        const walk = (o: unknown, prefix: string) => {
          if (o && typeof o === "object" && !Array.isArray(o) && !(o instanceof Date)) for (const [k, v] of Object.entries(o)) { paths.add(prefix + k); walk(v, `${prefix}${k}.`); }
        };
        for (const doc of await d.collection(collection).find({}).toArray()) walk(doc, "");
        return paths;
      };
      for (const key of ["clients", "projects", "tasks", "employees", "departments", "invoices", "expenses", "vendors", "leads"]) {
        const e = ENTITIES.find((x) => x.key === key)!;
        const paths = await have(e.collection);
        for (const f of e.fields) if (!f.expr) assert.ok(paths.has(f.path), `${key}.${f.key}: path "${f.path}" does not exist in a document the real create function wrote`);
      }
    });
    // The rest (members, timesheets, leave, receipts, purchase orders) are covered by the interface-typed fixtures above.
  });

  console.log("catalog view (permission matrix)");
  const keysOf = (v: CatalogView) => [...v.entities.keys()].sort();
  const FIN = ["invoices", "receipts"];
  const PMS = ["clients", "employees", "project_members", "projects", "tasks", "timesheets"];
  const HR = ["departments", "employees", "leave_requests"];
  await check("Super Admin sees every entity", () => assert.deepEqual(keysOf(vAdmin), ENTITIES.map((e) => e.key).sort()));
  await check("finance-only, PMS manager, HR, sales, procurement roles each get exactly their entities", async () => {
    assert.deepEqual(keysOf(await view(A, user(["finance_manager"]))), FIN);
    assert.deepEqual(keysOf(await view(A, user(["pms_admin"]))), PMS);
    assert.deepEqual(keysOf(await view(A, user(["pms_manager"]))), ["clients", "employees", "timesheets"], "a project manager sees only their own projects in PMS, so no company-wide project/task/team data; clients and the timesheet review page (which shows everyone's) are product-wide");
    assert.equal((await view(A, user(["pms_manager"]))).restricted.some((r) => r.key === "projects"), true, "projects are listed as restricted by label");
    assert.deepEqual(keysOf(await view(A, user(["pms_manager"], { "pms.canViewAllProjects": true }))), PMS, "the override that widens the PMS product widens this too");
    assert.deepEqual(keysOf(await view(A, user(["pms_admin"], { "pms.canViewAllProjects": false }))), ["clients", "employees", "timesheets"], "and the one that narrows it narrows this (timesheet review is a separate capability in PMS)");
    assert.deepEqual(keysOf(await view(A, user(["hr"]))), HR);
    assert.deepEqual(keysOf(await view(A, user(["lms_manager"]))), ["leads"]);
    assert.deepEqual(keysOf(await view(A, user(["procurement_manager"]))), ["expenses", "purchase_orders", "vendors"]);
    assert.deepEqual(keysOf(await view(A, user(["finance"]))), ["expenses", "purchase_orders", "vendors"]);
    assert.deepEqual(keysOf(await view(A, user(["prms_admin"]))), ["expenses", "purchase_orders", "vendors"]);
    assert.deepEqual(keysOf(await view(A, user(["dept_manager"]))), [], "department managers only see their own department's spend in PRMS");
  });
  await check("employee-tier users and users with no product roles get an empty view (and nothing queryable)", async () => {
    for (const roles of [["pms_employee", "employee"], [], ["prms_employee"], ["intelligence_user"]]) {
      const v = await view(A, user(roles));
      assert.equal(v.entities.size, 0, roles.join());
      await rejected(A, v, { entity: "invoices", aggregates: [{ op: "count" }] }, "denied");
    }
  });
  await check("People who see all projects in PMS see employees as a name directory only; HR sees the full non-sensitive record", async () => {
    const pm = await view(A, user(["pms_admin"]));
    assert.deepEqual([...pm.entities.get("employees")!.fields.keys()].sort(), ["employeeCode", "firstName", "lastName"]);
    const hr = await view(A, user(["hr"]));
    assert.ok(hr.entities.get("employees")!.fields.has("joiningDate"));
    for (const v of [pm, hr, vAdmin]) for (const key of ["workEmail", "personalEmail", "phone", "dateOfBirth"]) assert.ok(!v.entities.get("employees")!.fields.has(key), `sensitive ${key} never offered`);
  });
  await check("relations exist only when the target entity is also permitted", async () => {
    const fin = await view(A, user(["finance_manager"]));
    assert.equal(fin.entities.get("invoices")!.relations.size, 0, "no client/project join for finance-only");
    assert.deepEqual([...(await view(A, user(["pms_admin"]))).entities.get("projects")!.relations.keys()].sort(), ["client", "manager"]);
    assert.equal((await view(A, user(["hr"]))).entities.get("leave_requests")!.relations.size, 1, "leave -> employee for HR");
  });
  await check("restricted entities are listed by label only (to explain 'not available'), never with data", async () => {
    const fin = await view(A, user(["finance_manager"]));
    assert.ok(fin.restricted.some((r) => r.key === "clients") && !fin.restricted.some((r) => r.key === "invoices"));
    assert.deepEqual(Object.keys(fin.restricted[0]).sort(), ["key", "label"]);
  });
  await check("a Super Admin override that removes 'see all employees' is honoured", async () => {
    assert.ok(keysOf(await view(A, user(["hr"], { "hrms.canViewAllEmployees": false }))).length === 0);
  });
  await check("products outside the plan, or switched off, are simply absent", async () => {
    assert.deepEqual(keysOf(await view(STARTER, admin)), ["clients", "departments", "employees", "leads", "leave_requests", "project_members", "projects", "tasks", "timesheets"], "Starter plan has no Finance/Procurement");
    assert.deepEqual(keysOf(await view(NOPMS, admin)), ["departments", "employees", "invoices", "leads", "leave_requests", "receipts"], "Projects switched off");
  });
  await check("live statistics: counts, date range and small-enum values", async () => {
    const inv = vAdmin.entities.get("invoices")!;
    assert.equal(inv.stats.count, 8, "soft-deleted invoice excluded");
    assert.ok(inv.stats.from && inv.stats.to && inv.stats.from <= inv.stats.to);
    assert.deepEqual(vAdmin.entities.get("clients")!.stats.values.industry, ["Finance", "Retail"]);
    assert.equal(vAdmin.timezone, "Asia/Kolkata");
    assert.equal(vAdmin.today, today);
  });
  await check("example questions are generated from the user's entities", async () => {
    assert.ok(exampleQuestions(vAdmin).length >= 6);
    const fin = exampleQuestions(await view(A, user(["finance_manager"])));
    assert.ok(fin.length > 0 && fin.every((q) => /revenue|unpaid|collect|invoice|monthly/i.test(q)), fin.join(" | "));
    assert.deepEqual(exampleQuestions(await view(A, user([]))), []);
  });

  console.log("example questions on seeded data");
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
  const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
  const live = <T extends { deletedAt: Date | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);
  await check("how many active clients do we have", async () => {
    const r = await ok(A, vAdmin, { entity: "clients", aggregates: [{ op: "count", as: "active_clients" }], filters: [{ field: "status", op: "eq", value: "active" }] });
    assert.deepEqual(rows(r), [{ active_clients: 2 }]);
    assert.deepEqual(r.totals, { active_clients: 2 });
  });
  await check("this month's revenue (invoiced; draft/cancelled/deleted excluded; rupees)", async () => {
    const r = await ok(A, vAdmin, { entity: "invoices", aggregates: [{ op: "sum", field: "totalAmount", as: "revenue" }, { op: "count", as: "invoices" }], filters: [{ field: "status", op: "in", value: REVENUE_STATUSES }, { field: "invoiceDate", op: "between", value: [monthStart, monthEnd] }] });
    assert.deepEqual(rows(r), [{ revenue: 150000, invoices: 2 }]);
    assert.equal(r.columns.find((c) => c.key === "revenue")!.type, "money");
    assert.equal(r.columns.find((c) => c.key === "revenue")!.unit, "rupees");
  });
  await check("this month's collections come from receipts (BSON dates, company time zone, voided excluded)", async () => {
    const r = await ok(A, vAdmin, { entity: "receipts", aggregates: [{ op: "sum", field: "amount", as: "collected" }], filters: [{ field: "status", op: "eq", value: "completed" }, { field: "receiptDate", op: "between", value: [monthStart, monthEnd] }] });
    assert.deepEqual(rows(r), [{ collected: 100000 }], "00:00 IST on the 1st counts; 23:30 IST on the previous day does not");
    const last = await ok(A, vAdmin, { entity: "receipts", aggregates: [{ op: "sum", field: "amount", as: "collected" }], filters: [{ field: "status", op: "eq", value: "completed" }, { field: "receiptDate", op: "between", value: [`${lastMonth}-01`, lastMonthEnd] }] });
    assert.deepEqual(rows(last), [{ collected: 20000 }]);
  });
  await check("delayed projects", async () => {
    for (const filters of [[{ field: "isDelayed", op: "eq", value: true }], [{ field: "status", op: "in", value: ["planning", "in_progress", "review", "testing"] }, { field: "endDate", op: "lt", value: today }]]) {
      const r = await ok(A, vAdmin, { entity: "projects", select: [{ field: "projectCode" }, { field: "name" }, { field: "endDate" }, { field: "status" }], filters, sort: [{ by: "projectCode" }] });
      assert.deepEqual(rows(r).map((x) => x.name), ["Website Redesign", "ERP Rollout"]);
    }
  });
  await check("employees who joined this year", async () => {
    const r = await ok(A, vAdmin, { entity: "employees", select: [{ field: "employeeCode" }, { field: "firstName" }, { field: "joiningDate" }], filters: [{ field: "joiningDate", op: "between", value: [`${Y}-01-01`, `${Y}-12-31`] }], sort: [{ by: "joiningDate" }] });
    assert.deepEqual(rows(r).map((x) => x.firstName), ["Asha", "Meera"], "deleted employee excluded");
  });
  await check("unpaid invoices: count and balance due (computed field)", async () => {
    const r = await ok(A, vAdmin, { entity: "invoices", aggregates: [{ op: "count", as: "n" }, { op: "sum", field: "balance", as: "owed" }], filters: [{ field: "status", op: "in", value: ["sent", "partially_paid", "overdue"] }, { field: "invoiceDate", op: "gte", value: `${Y}-01-01` }] });
    assert.deepEqual(rows(r), [{ n: 2, owed: 50000 }]);
    const overdue = await ok(A, vAdmin, { entity: "invoices", select: [{ field: "invoiceNumber" }, { field: "balance" }], filters: [{ field: "isOverdue", op: "eq", value: true }, { field: "invoiceDate", op: "gte", value: `${Y}-01-01` }], sort: [{ by: "balance", dir: "desc" }] });
    assert.deepEqual(rows(overdue).map((x) => x.balance), [30000, 20000]);
  });
  await check("top clients by revenue", async () => {
    const r = await ok(A, vAdmin, { entity: "invoices", select: [{ field: "customerName" }], aggregates: [{ op: "sum", field: "totalAmount", as: "revenue" }], filters: [{ field: "status", op: "in", value: REVENUE_STATUSES }], sort: [{ by: "revenue", dir: "desc" }], limit: 5 });
    const want = new Map<string, number>();
    for (const i of live(fa.i)) if (REVENUE_STATUSES.includes(i.status)) want.set(i.customerName, sum([want.get(i.customerName) ?? 0, i.totalAmount]));
    const expected = [...want.entries()].sort((a, b) => b[1] - a[1]).map(([customerName, revenue]) => ({ customerName, revenue }));
    assert.deepEqual(rows(r), expected);
    assert.equal(rows(r)[0].customerName, "Acme Corp");
    // The same by joining the client record.
    const j = await ok(A, vAdmin, { entity: "invoices", select: [{ field: "client.companyName", as: "client" }], aggregates: [{ op: "sum", field: "totalAmount", as: "revenue" }], filters: [{ field: "status", op: "in", value: REVENUE_STATUSES }], sort: [{ by: "revenue", dir: "desc" }], limit: 5 });
    assert.deepEqual(rows(j).map((x) => [x.client, x.revenue]), expected.filter((x) => x.customerName !== "Linked to A").map((x) => [x.customerName, x.revenue]));
  });
  await check("project-wise expenses (approved/reimbursed only, unassigned excluded)", async () => {
    const r = await ok(A, vAdmin, { entity: "expenses", select: [{ field: "projectName" }], aggregates: [{ op: "sum", field: "amount", as: "spent" }], filters: [{ field: "projectId", op: "is_null", value: false }, { field: "approvalStatus", op: "in", value: ["approved", "reimbursed"] }], sort: [{ by: "spent", dir: "desc" }] });
    assert.deepEqual(rows(r), [{ projectName: "Website Redesign", spent: 17000 }, { projectName: "Mobile App", spent: 8000 }]);
  });
  await check("leads by source", async () => {
    const r = await ok(A, vAdmin, { entity: "leads", select: [{ field: "source" }], aggregates: [{ op: "count", as: "leads" }], sort: [{ by: "leads", dir: "desc" }, { by: "source" }] });
    assert.deepEqual(rows(r), [{ source: "software_development", leads: 3 }, { source: "job_portal", leads: 2 }, { source: "manual", leads: 1 }]);
  });
  await check("employees assigned to a project (two joins, active assignments only)", async () => {
    const r = await ok(A, vAdmin, { entity: "project_members", select: [{ field: "employee.firstName", as: "first" }, { field: "employee.lastName", as: "last" }, { field: "role" }], filters: [{ field: "project.name", op: "eq", value: "Website Redesign" }, { field: "active", op: "eq", value: true }], sort: [{ by: "first" }] });
    assert.deepEqual(rows(r), [{ first: "Asha", last: "Menon", role: "developer" }, { first: "Ravi", last: "Rao", role: "qa" }]);
    // A PMS admin (directory view of employees) can answer it too.
    const pm = await view(A, user(["pms_admin"]));
    const r2 = await ok(A, pm, { entity: "project_members", select: [{ field: "employee.firstName", as: "first" }], filters: [{ field: "project.name", op: "contains", value: "website" }, { field: "active", op: "eq", value: true }], sort: [{ by: "first" }] });
    assert.deepEqual(rows(r2).map((x) => x.first), ["Asha", "Ravi"]);
  });
  await check("monthly revenue this year (bucketed by month, in order)", async () => {
    const r = await ok(A, vAdmin, { entity: "invoices", select: [{ field: "invoiceDate", bucket: "month", as: "month" }], aggregates: [{ op: "sum", field: "totalAmount", as: "revenue" }], filters: [{ field: "status", op: "in", value: REVENUE_STATUSES }, { field: "invoiceDate", op: "between", value: [`${Y}-01-01`, `${Y}-12-31`] }] });
    const want = new Map<string, number>();
    for (const i of live(fa.i)) if (REVENUE_STATUSES.includes(i.status) && inRange(i.invoiceDate, `${Y}-01-01`, `${Y}-12-31`)) want.set(i.invoiceDate.slice(0, 7), sum([want.get(i.invoiceDate.slice(0, 7)) ?? 0, i.totalAmount]));
    assert.deepEqual(rows(r), [...want.entries()].sort().map(([month, revenue]) => ({ month, revenue })));
    assert.equal(r.columns[0].type, "period");
  });
  await check("other business questions: overdue tasks, pending leave, hours per project, headcount by department, PO value", async () => {
    assert.deepEqual(rows(await ok(A, vAdmin, { entity: "tasks", select: [{ field: "assignee.firstName", as: "who" }], aggregates: [{ op: "count", as: "overdue" }], filters: [{ field: "isOverdue", op: "eq", value: true }] })), [{ who: "Asha", overdue: 1 }]);
    assert.deepEqual(rows(await ok(A, vAdmin, { entity: "leave_requests", aggregates: [{ op: "count", as: "pending" }], filters: [{ field: "status", op: "eq", value: "pending" }] })), [{ pending: 1 }]);
    assert.deepEqual(rows(await ok(A, vAdmin, { entity: "timesheets", select: [{ field: "project.name", as: "project" }], aggregates: [{ op: "sum", field: "hours", as: "hours" }] })), [{ project: "Website Redesign", hours: 10 }]);
    assert.deepEqual(rows(await ok(A, vAdmin, { entity: "employees", select: [{ field: "department.name", as: "dept" }], aggregates: [{ op: "count", as: "people" }], filters: [{ field: "status", op: "neq", value: "relieved" }], sort: [{ by: "people", dir: "desc" }] })), [{ dept: "Engineering", people: 2 }, { dept: "Sales", people: 1 }]);
    assert.deepEqual(rows(await ok(A, vAdmin, { entity: "purchase_orders", select: [{ field: "vendor.companyName", as: "vendor" }], aggregates: [{ op: "sum", field: "totalAmount", as: "value" }], filters: [{ field: "status", op: "in", value: ["issued", "partially_received"] }] })), [{ vendor: "Cloud One", value: 40000 }]);
    assert.deepEqual(rows(await ok(A, vAdmin, { entity: "vendors", select: [{ field: "category" }], aggregates: [{ op: "count", as: "n" }], filters: [{ field: "status", op: "eq", value: "active" }], sort: [{ by: "category" }] })), [{ category: "cloud_provider", n: 1 }, { category: "furniture_vendor", n: 1 }]);
  });
  await check("empty aggregate still answers with zero, not nothing; min/max/avg/count_distinct", async () => {
    assert.deepEqual(rows(await ok(A, vAdmin, { entity: "clients", aggregates: [{ op: "count", as: "n" }, { op: "sum", field: "estimatedBudget", as: "s" }].slice(0, 1), filters: [{ field: "status", op: "eq", value: "prospect" }] })), [{ n: 0 }]);
    const r = await ok(A, vAdmin, { entity: "invoices", aggregates: [{ op: "avg", field: "totalAmount", as: "avg" }, { op: "min", field: "invoiceDate", as: "first" }, { op: "max", field: "totalAmount", as: "biggest" }, { op: "count_distinct", field: "customerName", as: "customers" }], filters: [{ field: "status", op: "in", value: REVENUE_STATUSES }, { field: "invoiceDate", op: "gte", value: `${Y}-01-01` }] });
    assert.equal(rows(r)[0].customers, 3);
    assert.equal(rows(r)[0].biggest, 100000);
    assert.equal(rows(r)[0].first, `${Y}-01-05`);
  });
  await check("date buckets: day, week, month, quarter, year", async () => {
    for (const [bucket, re] of [["day", /^\d{4}-\d{2}-\d{2}$/], ["week", /^\d{4}-W\d{2}$/], ["month", /^\d{4}-\d{2}$/], ["quarter", /^\d{4}-Q[1-4]$/], ["year", /^\d{4}$/]] as const) {
      const r = await ok(A, vAdmin, { entity: "invoices", select: [{ field: "invoiceDate", bucket, as: "p" }], aggregates: [{ op: "count", as: "n" }] });
      assert.ok(rows(r).length > 0 && rows(r).every((x) => re.test(String(x.p))), `${bucket}: ${rows(r).map((x) => x.p).join()}`);
    }
    const q = await ok(A, vAdmin, { entity: "receipts", select: [{ field: "receiptDate", bucket: "quarter", as: "q" }], aggregates: [{ op: "count", as: "n" }] });
    assert.ok(rows(q).every((x) => /^\d{4}-Q[1-4]$/.test(String(x.q))), "BSON-date buckets work too");
  });
  await check("money stays in rupees with two decimals", async () => {
    const r = await ok(A, vAdmin, { entity: "invoices", aggregates: [{ op: "sum", field: "totalAmount", as: "t" }], filters: [{ field: "invoiceDate", op: "eq", value: `${Y}-01-05` }] });
    assert.deepEqual(rows(r), [{ t: 10000.55 }]);
  });

  console.log("security");
  const vFin = await view(A, user(["finance_manager"]));
  const vPms = await view(A, user(["pms_admin"]));
  await check("a hidden entity is rejected and never run", async () => {
    const msg = await rejected(A, vFin, { entity: "clients", aggregates: [{ op: "count" }] }, "denied");
    assert.match(msg, /not available/);
    await rejected(A, vFin, { entity: "no_such_entity", aggregates: [{ op: "count" }] }, "unknown_entity");
    await rejected(A, vPms, { entity: "invoices", aggregates: [{ op: "sum", field: "totalAmount" }] }, "denied");
  });
  await check("sensitive, hidden and unknown fields are rejected (select, filter, aggregate, sort, join)", async () => {
    await rejected(A, vAdmin, { entity: "clients", select: [{ field: "contactEmail" }] }, "unknown_field");
    await rejected(A, vAdmin, { entity: "vendors", select: [{ field: "bankAccountNumber" }] }, "unknown_field");
    await rejected(A, vAdmin, { entity: "vendors", select: [{ field: "companyName" }], filters: [{ field: "pan", op: "eq", value: "AAAAA0000A" }] }, "unknown_field");
    await rejected(A, vAdmin, { entity: "project_members", aggregates: [{ op: "sum", field: "costRate" }] }, "unknown_field");
    await rejected(A, vAdmin, { entity: "leave_requests", select: [{ field: "reason" }] }, "unknown_field");
    await rejected(A, vAdmin, { entity: "employees", select: [{ field: "workEmail" }] }, "unknown_field");
    await rejected(A, vAdmin, { entity: "invoices", select: [{ field: "client.contactEmail" }] }, "unknown_field");
    await rejected(A, vAdmin, { entity: "clients", select: [{ field: "nonsense" }] }, "unknown_field");
    await rejected(A, vAdmin, { entity: "clients", select: [{ field: "companyName" }], sort: [{ by: "contactEmail" }] });
    await rejected(A, vPms, { entity: "projects", select: [{ field: "manager.status" }] }, "unknown_field"); // directory view of employees: no status
    await rejected(A, vAdmin, { entity: "clients", select: [{ field: "name.$ne" }] });
    await rejected(A, vAdmin, { entity: "clients", select: [{ field: "$where" }] });
  });
  await check("a relation to a non-permitted entity is rejected", async () => {
    await rejected(A, vFin, { entity: "invoices", select: [{ field: "invoiceNumber" }], joins: ["client"] }, "denied");
    await rejected(A, vFin, { entity: "invoices", select: [{ field: "client.companyName" }] });
    await rejected(A, await view(A, user(["hr"])), { entity: "leave_requests", select: [{ field: "employee.firstName" }], joins: ["project"] }, "unknown_field");
    await rejected(A, vAdmin, { entity: "project_members", select: [{ field: "employee.firstName" }, { field: "project.name" }, { field: "project.client.companyName" }] });
  });
  await check("no value is ever interpreted as an operator, expression or unescaped regex", async () => {
    await rejected(A, vAdmin, { entity: "clients", select: [{ field: "companyName" }], filters: [{ field: "status", op: "eq", value: { $ne: null } }] });
    await rejected(A, vAdmin, { entity: "clients", select: [{ field: "companyName" }], filters: [{ field: "companyName", op: "in", value: [{ $gt: "" }] }] });
    await rejected(A, vAdmin, { entity: "clients", select: [{ field: "companyName" }], filters: [{ field: "companyName", op: "eq", value: { $where: "sleep(1000)" } }] });
    // Strings that look like operators or field paths are plain data.
    for (const evil of ["$where", "$ne", "{\"$gt\":\"\"}", "$companyName", "' || '1'=='1"]) {
      const r = await ok(A, vAdmin, { entity: "clients", aggregates: [{ op: "count", as: "n" }], filters: [{ field: "companyName", op: "eq", value: evil }] });
      assert.deepEqual(rows(r), [{ n: 0 }], evil);
    }
    const all = await ok(A, vAdmin, { entity: "clients", aggregates: [{ op: "count", as: "n" }], filters: [{ field: "companyName", op: "contains", value: ".*" }] });
    assert.deepEqual(rows(all), [{ n: 0 }], "regex metacharacters are escaped, not interpreted");
    for (const meta of ["(", "[a-", "\\", "^Acme$", "Acme|Beta", "a{1,2}"]) {
      const r = await ok(A, vAdmin, { entity: "clients", aggregates: [{ op: "count", as: "n" }], filters: [{ field: "companyName", op: "contains", value: meta }] });
      assert.deepEqual(rows(r), [{ n: 0 }], meta);
    }
    assert.deepEqual(rows(await ok(A, vAdmin, { entity: "clients", aggregates: [{ op: "count", as: "n" }], filters: [{ field: "companyName", op: "contains", value: "ACME" }] })), [{ n: 1 }], "contains is case-insensitive");
    // Enum values are checked against the registry.
    await rejected(A, vAdmin, { entity: "clients", aggregates: [{ op: "count" }], filters: [{ field: "status", op: "eq", value: "$ne" }] });
    // Output names can't smuggle operators or paths.
    await rejected(A, vAdmin, { entity: "clients", aggregates: [{ op: "count", as: "$where" }] });
    await rejected(A, vAdmin, { entity: "clients", aggregates: [{ op: "count", as: "a.b" }] });
    await rejected(A, vAdmin, { entity: "clients", select: [{ field: "companyName", as: "_id" }] });
  });
  await check("unknown properties, operators and shapes are rejected", async () => {
    for (const plan of [
      { entity: "clients", select: [{ field: "companyName" }], $where: "1" },
      { entity: "clients", pipeline: [{ $out: "x" }] },
      { entity: "clients", aggregates: [{ op: "$function", field: "status" }] },
      { entity: "clients", aggregates: [{ op: "count" }], filters: [{ field: "status", op: "regex", value: ".*" }] },
      { entity: "clients", aggregates: [{ op: "count" }], filters: [{ field: "status", op: "$eq", value: "active" }] },
      { entity: "clients", aggregates: [{ op: "count" }], filters: [{ field: "status", op: "eq", value: "active", $or: [] }] },
      { entity: "clients", aggregates: [{ op: "sum", field: "companyName" }] },
      { entity: "clients", aggregates: [{ op: "sum", field: "status" }] },
      { entity: "projects", aggregates: [{ op: "count" }], filters: [{ field: "name", op: "gt", value: "a" }] },
      { entity: "invoices", aggregates: [{ op: "count" }], filters: [{ field: "invoiceDate", op: "eq", value: "2026-02-31" }] },
      { entity: "invoices", aggregates: [{ op: "count" }], filters: [{ field: "invoiceDate", op: "eq", value: "yesterday" }] },
      { entity: "invoices", aggregates: [{ op: "count" }], filters: [{ field: "totalAmount", op: "gt", value: "100" }] },
      { entity: "invoices", aggregates: [{ op: "count" }], filters: [{ field: "totalAmount", op: "between", value: [5, 1] }] },
      { entity: "invoices", select: [{ field: "customerName", bucket: "month" }], aggregates: [{ op: "count" }] },
      { entity: "invoices", select: [{ field: "totalAmount" }], aggregates: [{ op: "count" }] },
      { entity: "invoices", select: [{ field: "invoiceDate", bucket: "month" }] },
      { entity: "invoices", select: [{ field: "invoiceNumber" }], sort: [{ by: "nope" }] },
      { entity: "invoices" },
      { entity: "invoices", select: [{ field: "invoiceNumber" }, { field: "invoiceNumber" }] },
      { entity: "invoices", select: [{ field: "customerName" }, { field: "customerName" }], aggregates: [{ op: "count" }] },
      { entity: "project_members", select: [{ field: "employee.firstName" }], joins: ["employee", "project", "employee"].slice(0, 2).concat(["x"]) },
      "just text",
      null,
      [],
    ]) await rejected(A, vAdmin, plan);
  });
  await check("limits: rows capped at 500, truncation reported; at most 2 joins; filters and in-lists bounded", async () => {
    const d = await runAsCompany(A, () => getDb());
    await runAsCompany(A, async () => {
      await d.collection("lead_records").insertMany(Array.from({ length: 700 }, (_, n) => ({ ...fixture("A", { amount: 1, extraActive: 0 }).l[0], _id: `A-bulk${n}` as never, code: `B${n}` })) as never[]);
    });
    const r = await ok(A, vAdmin, { entity: "leads", select: [{ field: "code" }], limit: 100000 });
    assert.equal(r.rowCount, LIMITS.maxRows);
    assert.equal(r.rows.length, 500);
    assert.equal(r.truncated, true);
    assert.equal(r.totals, null);
    const small = await ok(A, vAdmin, { entity: "leads", select: [{ field: "code" }], limit: 3 });
    assert.deepEqual([small.rowCount, small.truncated], [3, true]);
    await runAsCompany(A, async () => void (await d.collection("lead_records").deleteMany({ _id: /^A-bulk/ as never })));
    const exact = await ok(A, vAdmin, { entity: "leads", select: [{ field: "code" }], limit: 6 });
    assert.deepEqual([exact.rowCount, exact.truncated], [6, false], "exactly the limit is not truncated");
    await rejected(A, vAdmin, { entity: "tasks", select: [{ field: "project.name" }, { field: "assignee.firstName" }, { field: "project.client.x" }] });
    await rejected(A, vAdmin, { entity: "clients", aggregates: [{ op: "count" }], filters: Array.from({ length: 13 }, () => ({ field: "status", op: "eq", value: "active" })) });
    await rejected(A, vAdmin, { entity: "clients", aggregates: [{ op: "count" }], filters: [{ field: "industry", op: "in", value: Array.from({ length: 51 }, (_, n) => `i${n}`) }] });
    await rejected(A, vAdmin, { entity: "clients", select: [{ field: "companyName" }], limit: 0 });
    // The model is shown at most 60 rows (the server keeps up to 500).
    const { resultForModel } = await import("@/lib/products/databrain-ai/query/execute");
    await runAsCompany(A, async () => void (await d.collection("lead_records").insertMany(Array.from({ length: 200 }, (_, n) => ({ ...fixture("A", { amount: 1, extraActive: 0 }).l[0], _id: `A-m${n}` as never, code: `M${n}` })) as never[])));
    const big = await ok(A, vAdmin, { entity: "leads", select: [{ field: "code" }], limit: 150 });
    const shown = resultForModel(big);
    assert.equal((shown.rows as unknown[]).length, 60);
    assert.equal(shown.rowCount, 150);
    await runAsCompany(A, async () => void (await d.collection("lead_records").deleteMany({ _id: /^A-m/ as never })));
  });
  await check("every query is read-only, allowlisted, base-filtered and time-limited", async () => {
    const plans = [
      { entity: "invoices", select: [{ field: "client.companyName" }, { field: "project.name" }, { field: "invoiceDate", bucket: "quarter" }], aggregates: [{ op: "sum", field: "balance" }, { op: "count_distinct", field: "customerName" }, { op: "max", field: "invoiceDate" }], filters: [{ field: "isOverdue", op: "eq", value: true }, { field: "project.status", op: "neq", value: "completed" }, { field: "status", op: "in", value: ["sent"] }, { field: "customerName", op: "contains", value: "a.b" }], sort: [{ by: "sum_balance", dir: "desc" }] },
      { entity: "receipts", select: [{ field: "receiptDate" }], filters: [{ field: "receiptDate", op: "between", value: ["2026-01-01", "2026-12-31"] }] },
      { entity: "projects", select: [{ field: "name" }], filters: [{ field: "isDelayed", op: "eq", value: true }] },
    ];
    for (const plan of plans) {
      const rp = validatePlan(vAdmin, plan);
      const spec = translate(rp, { today, timezone: TZ });
      assert.equal(spec.options.maxTimeMS, 10_000);
      assert.equal(spec.collection, rp.entity.def.collection);
      assert.deepEqual((spec.pipeline[0].$match as { $and: unknown[] }).$and[0], { deletedAt: null }, "starts with the entity's base filter");
      assertSafePipeline(spec.pipeline);
      const keys: string[] = [];
      const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object" && !(v instanceof Date)) for (const [k, c] of Object.entries(v)) { keys.push(k); walk(c); } };
      walk(spec.pipeline);
      for (const bad of ["$out", "$merge", "$where", "$function", "$accumulator", "$unionWith", "$graphLookup", "$expr", "$set"]) assert.ok(!keys.includes(bad), bad);
      const stages = spec.pipeline.map((s) => Object.keys(s)[0]);
      assert.ok(stages.every((s) => ["$match", "$addFields", "$lookup", "$unwind", "$group", "$project", "$sort", "$limit"].includes(s)), stages.join());
      assert.equal(stages.at(-1), "$limit");
    }
    for (const bad of [[{ $out: "x" }], [{ $merge: { into: "x" } }], [{ $match: { $where: "1" } }], [{ $project: { a: { $function: { body: "", args: [], lang: "js" } } } }], [{ $lookup: { from: "x", pipeline: [{ $out: "y" }], as: "z" } }], [{ $unionWith: "x" }], [{ $match: {}, $limit: 1 }]]) {
      assert.throws(() => assertSafePipeline(bad as never), /not allowed|Forbidden/);
    }
  });
  await check("the query module has no write path at all (no write call exists in its source)", () => {
    const dir = path.join(process.cwd(), "src/lib/databrain-ai");
    const files: string[] = [];
    const walk = (p: string) => {
      for (const f of fs.readdirSync(p, { withFileTypes: true })) {
        if (f.isDirectory()) walk(path.join(p, f.name));
        else if (f.name.endsWith(".ts")) files.push(path.join(p, f.name));
      }
    };
    walk(path.join(dir, "query"));
    walk(path.join(dir, "catalog"));
    files.push(path.join(dir, "answer.ts"), path.join(dir, "prompt.ts"));
    const WRITE = /\.(insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|replaceOne|findOneAndUpdate|findOneAndReplace|findOneAndDelete|bulkWrite|drop|dropIndex|createIndex|rename)\s*\(/;
    for (const f of files) assert.ok(!WRITE.test(fs.readFileSync(f, "utf8")), `${path.relative(process.cwd(), f)} must not write`);
  });
  await check("the database is untouched by questions (document counts unchanged)", async () => {
    const d = await runAsCompany(A, () => getDb());
    const count = () => runAsCompany(A, async () => (await Promise.all(["fms_invoices", "pms_clients", "pms_projects", "hrms_employees"].map((c) => d.collection(c).countDocuments({})))).join());
    const before = await count();
    await ok(A, vAdmin, { entity: "invoices", select: [{ field: "client.companyName" }], aggregates: [{ op: "sum", field: "totalAmount" }] });
    assert.equal(await count(), before);
  });

  console.log("tenant isolation");
  const vB = await view(B, admin);
  await check("each company's plans return only its own numbers (aggregates, lists, joins, $lookup)", async () => {
    const q = { entity: "invoices", aggregates: [{ op: "sum", field: "totalAmount", as: "revenue" }, { op: "count", as: "n" }], filters: [{ field: "status", op: "in", value: REVENUE_STATUSES }, { field: "invoiceDate", op: "between", value: [monthStart, monthEnd] }] };
    assert.deepEqual(rows(await ok(A, vAdmin, q)), [{ revenue: 150000, n: 2 }]);
    // B: ten times the amounts, plus its own "linked" invoice (100000 x 10) — A's numbers never leak in.
    assert.deepEqual(rows(await ok(B, vB, q)), [{ revenue: 2500000, n: 3 }]);
    const clients = { entity: "clients", aggregates: [{ op: "count", as: "n" }], filters: [{ field: "status", op: "eq", value: "active" }] };
    assert.deepEqual(rows(await ok(A, vAdmin, clients)), [{ n: 2 }]);
    assert.deepEqual(rows(await ok(B, vB, clients)), [{ n: 5 }]);
    // Joined data comes only from the same company.
    const joined = { entity: "project_members", select: [{ field: "employee.firstName", as: "f" }, { field: "project.name", as: "p" }], sort: [{ by: "f" }] };
    assert.equal((await ok(A, vAdmin, joined)).rowCount, 4);
    assert.equal((await ok(B, vB, joined)).rowCount, 4);
  });
  await check("a reference from company B to company A's record does not resolve", async () => {
    const r = await ok(B, vB, { entity: "invoices", select: [{ field: "invoiceNumber" }, { field: "client.companyName", as: "client" }], filters: [{ field: "invoiceNumber", op: "eq", value: "INV-XLINK" }] });
    assert.deepEqual(rows(r), [{ invoiceNumber: "INV-XLINK", client: null }], "A's client is invisible to B");
    const ra = await ok(A, vAdmin, { entity: "invoices", select: [{ field: "invoiceNumber" }], filters: [{ field: "invoiceNumber", op: "eq", value: "INV-XLINK" }] });
    assert.equal(ra.rowCount, 0, "and B's invoice is invisible to A");
  });
  await check("a view built for company A cannot be used to read company B (the database scope, not the view, decides)", async () => {
    // Even with A's view in hand, running inside B returns B's rows only — never A's — and A's ids are not reachable.
    const r = await runAsCompany(B, () => runPlan(vAdmin, { entity: "clients", select: [{ field: "clientCode" }], filters: [{ field: "clientCode", op: "eq", value: "CLI-c1" }] }, "q1"));
    assert.ok(r.ok);
    const idsA = new Set(fa.c.map((c) => c._id));
    const ids = await runAsCompany(B, async () => (await (await getDb()).collection("pms_clients").find({}).toArray()).map((c) => String(c._id)));
    assert.ok(ids.every((id) => !idsA.has(id)));
  });

  console.log(`intelligence planner: all ${passed} checks passed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await clientPromise;
    await c.db().dropDatabase();
    await c.close();
  });
