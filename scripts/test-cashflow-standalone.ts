/**
 * A company with CashFlow alone: it keeps its own customers, vendors and vendor bills, sees no screen or link that
 * needs another product, and the checks that depend on one are left out. Runs against a throwaway database.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { clientPromise, getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { listPlans } from "@/lib/platform/billing/plans";
import { updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { setCompanyProducts } from "@/lib/platform/products/company-products";
import { unavailablePanelKeys } from "@/lib/platform/panels/store";
import { hrefAvailable, localHref } from "@/lib/platform/products/routes";
import { saveClientRecord } from "@/lib/products/sprintos/client-write";
import { saveVendorRecord } from "@/lib/products/spendiq/vendor-write";
import { saveBillRecord, decideBill, deleteBill } from "@/lib/products/spendiq/bill-write";
import { listCustomers } from "@/lib/products/cashflow-ai/customers";
import { listVendors } from "@/lib/products/cashflow-ai/vendors";
import { listBills, getBillDetail } from "@/lib/products/cashflow-ai/bills";
import { totalOutstandingPayable } from "@/lib/products/cashflow-ai/payables";
import { startPlan, loadWork } from "@/lib/products/cashflow-ai/work/store";
import { getMonthClose } from "@/lib/products/cashflow-ai/month-close/store";
import { runHealthChecks } from "@/lib/products/cashflow-ai/compliance/health";
import { loadSetupSteps } from "@/lib/products/cashflow-ai/home/home";
import { listPendingApprovals } from "@/lib/products/cashflow-ai/approvals";

let checks = 0;
function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  checks++;
}
function eq<T>(a: T, b: T, msg: string) {
  assert.deepEqual(a, b, msg);
  checks++;
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx$/.test(e.name) ? [join(dir, e.name)] : []));
}

async function main() {
  const db = await getPlatformDb();
  if (!/test/.test(db.databaseName)) throw new Error(`Refusing to run against "${db.databaseName}"`);

  // No screen writes a plain link into another product: those go through ProductLink (which knows the stand-in).
  for (const f of [...files("src/app/(products)/cashflow-ai"), ...files("src/components/products/cashflow-ai")]) {
    // a screen that itself needs the other product may link to it freely
    const url = f.startsWith("src/app") ? f.replace(/^src\/app\/\(products\)|\/\(protected\)|\/page\.tsx$/g, "") : "";
    if (url && !hrefAvailable(url, new Set(["pms", "prms", "hrms", "tms", "lms", "sop"]))) continue;
    const bad = readFileSync(f, "utf8").split("\n").filter((l) => /<(Link|a)\s[^>]*href=\{?[`"]\/(spendiq|sprintos|talentos|cohort-ai|dealflow-ai|playbook-ai|clientos)\b/.test(l));
    // "managed in SpendIQ / SprintOS" notes are shown only to companies that have it
    assert.deepEqual(bad.filter((l) => !/href="\/(spendiq\/vendors|sprintos\/clients)"/.test(l)), [], `${f}: plain link into another product`);
  }
  checks++;

  await listPlans();
  const now = new Date();
  const id = randomUUID();
  await db.collection("companies").insertOne({ _id: id as never, slug: "books", name: "Books Only", status: "active", isPlatformOwner: false, createdAt: now, updatedAt: now });
  await updateCompanySubscription(id, { planId: "growth", status: "active" });
  ok((await setCompanyProducts(id, { products: "fms" }, { id: "tester" })).ok, "CashFlow only");

  await runAsCompany(id, async () => {
    const hidden = await unavailablePanelKeys(id);
    const user = { id: "u1", email: "acc@books.test" };

    // --- which screens exist ---
    for (const p of ["/cashflow-ai", "/cashflow-ai/vendors", "/cashflow-ai/bills/x", "/cashflow-ai/customers", "/cashflow-ai/invoices", "/cashflow-ai/transactions", "/cashflow-ai/advances", "/cashflow-ai/gst/purchases", "/cashflow-ai/tds"]) ok(hrefAvailable(p, hidden), `${p} is open`);
    for (const p of ["payroll-runs", "salary-payments", "employee-expenses", "reimbursements", "assets/x", "asset-expenses", "asset-disposals", "reports/budget-vs-actual", "reports/project-profitability", "products/prms", "products/pms", "products/hrms", "products/tms"]) ok(!hrefAvailable(`/cashflow-ai/${p}`, hidden), `${p} needs another product`);
    ok(!hrefAvailable("/api/cashflow-ai/reports/budget-vs-actual?format=csv", hidden), "its export too");
    eq(localHref("/spendiq/invoices/b1", hidden), "/cashflow-ai/bills/b1", "a bill opens in CashFlow");
    eq(localHref("/spendiq/vendors/v1", hidden), "/cashflow-ai/vendors/v1", "a vendor opens in CashFlow");
    eq(localHref("/sprintos/clients", hidden), "/cashflow-ai/customers", "clients are customers");
    eq(localHref("/talentos/payroll", hidden), null, "no payroll, no link");
    eq(localHref("/spendiq/budgets", hidden), null, "no budgets, no link");
    eq(localHref("/spendiq/invoices/b1", new Set()), "/spendiq/invoices/b1", "a company with SpendIQ keeps its link");

    // --- its own records, from nothing ---
    const client = await saveClientRecord(user, { companyName: "Acme Retail", contactName: "Asha", contactEmail: "asha@acme.example" });
    ok(client.ok, `customer added ${JSON.stringify(client)}`);
    eq((await listCustomers({})).total, 1, "listed as a customer");
    const vendor = await saveVendorRecord(user, { companyName: "Paper Co", category: "other", status: "active", paymentTerms: "net_30", currency: "INR" });
    ok(vendor.ok, `vendor added ${JSON.stringify(vendor)}`);
    ok(!(await saveVendorRecord(user, { companyName: "" })).ok, "the same checks as SpendIQ");
    eq((await listVendors({})).total, 1, "listed as a vendor");
    const today = new Date().toISOString().slice(0, 10);
    const input = { vendorId: vendor.id, vendorInvoiceNumber: "PC-001", invoiceDate: today, subtotal: 1000, gstAmount: 180, currency: "INR" };
    const bill = await saveBillRecord(user, input);
    ok(bill.ok, `bill entered ${JSON.stringify(bill)}`);
    ok(!(await saveBillRecord(user, input)).ok, "the same vendor bill is refused twice");
    ok((await decideBill(user, bill.id!, "approved")).ok, "approved");
    eq((await getBillDetail(bill.id!))?.bill.status, "approved", "shows as approved");
    eq((await listBills({})).total, 1, "listed");
    eq(await totalOutstandingPayable(), 1180, "counted as payable");
    const second = await saveBillRecord(user, { ...input, vendorInvoiceNumber: "PC-002" });
    ok(second.ok && (await deleteBill(user, second.id!)).ok, "a bill entered by mistake is deleted");
    eq((await listBills({})).total, 1, "and gone");

    // --- the checks and lists leave out what it can't do ---
    ok((await startPlan(`${today.slice(0, 7)}-01`, user)).ok, "work plan started");
    const work = await loadWork(today);
    ok(work.instances.length > 0, "there is work to do");
    eq(work.instances.flatMap((i) => i.task.steps.map((s) => s.href).filter((h): h is string => !!h && !hrefAvailable(h, hidden))), [], "work links only to screens it has");
    const close = await getMonthClose(today.slice(0, 7));
    const keys = (close as unknown as { steps: { key: string }[] }).steps.map((s) => s.key);
    ok(keys.length > 5 && !keys.includes("payroll_done") && !keys.includes("depreciation_done"), "month close leaves out payroll and assets");
    const health = await runHealthChecks(today);
    ok(!health.some((h) => h.key === "payroll-dues") && health.every((h) => !h.href || hrefAvailable(h.href, hidden)), "health checks");
    ok((await loadSetupSteps()).every((s) => hrefAvailable(s.href, hidden)), "getting-started steps");
    ok((await listPendingApprovals()).every((a) => hrefAvailable(a.href, hidden)), "approvals");
  });

  console.log(`cashflow standalone: all ${checks} checks passed`);
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
    process.exit(process.exitCode ?? 0);
  });
