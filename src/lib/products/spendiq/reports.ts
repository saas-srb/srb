import "server-only";
import { getDb } from "@/lib/mongodb";
import { exportExpenses } from "@/lib/products/spendiq/expenses";
import { exportPurchaseOrders } from "@/lib/products/spendiq/purchase-orders";
import { exportVendors } from "@/lib/products/spendiq/vendors";
import { exportAssets } from "@/lib/products/spendiq/assets";
import { exportInventoryItems } from "@/lib/products/spendiq/inventory";
import { exportInvoices } from "@/lib/products/spendiq/invoices";
import { searchBudgets, serializeBudget } from "@/lib/products/spendiq/budgets";
import { listSubscriptions } from "@/lib/products/spendiq/software-subscriptions";
import { listInfrastructure } from "@/lib/products/spendiq/infrastructure";
import {
  getExpenseCategoryLabel,
  getExpenseStatusMeta,
  getPoStatusMeta,
  getVendorCategoryLabel,
  getInvoiceStatusMeta,
  round2,
} from "@/lib/products/spendiq/constants";

export const REPORT_TYPES = [
  { value: "expense", label: "Expense Report" },
  { value: "procurement", label: "Procurement Report" },
  { value: "vendor", label: "Vendor Report" },
  { value: "budget", label: "Budget Report" },
  { value: "asset", label: "Asset Report" },
  { value: "saas", label: "SaaS Report" },
  { value: "infrastructure", label: "Infrastructure Report" },
  { value: "inventory", label: "Inventory Report" },
  { value: "invoice", label: "Invoice Report" },
  { value: "profit-center", label: "Profit Center Report" },
] as const;

export type ReportType = (typeof REPORT_TYPES)[number]["value"];

export function isValidReportType(v: string): v is ReportType {
  return REPORT_TYPES.some((r) => r.value === v);
}

export interface ReportColumn {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
}

export interface Report {
  type: ReportType;
  title: string;
  meta: [string, string | number][];
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function buildReport(type: ReportType): Promise<Report> {
  switch (type) {
    case "expense":
      return buildExpenseReport();
    case "procurement":
      return buildProcurementReport();
    case "vendor":
      return buildVendorReport();
    case "budget":
      return buildBudgetReport();
    case "asset":
      return buildAssetReport();
    case "saas":
      return buildSaasReport();
    case "infrastructure":
      return buildInfrastructureReport();
    case "inventory":
      return buildInventoryReport();
    case "invoice":
      return buildInvoiceReport();
    case "profit-center":
      return buildProfitCentreReport();
  }
}

async function buildExpenseReport(): Promise<Report> {
  const rows = await exportExpenses();
  const total = round2(rows.reduce((s, e) => s + e.totalAmount, 0));
  return {
    type: "expense",
    title: "Expense Report",
    meta: [["Generated", stamp()], ["Records", rows.length], ["Total (incl. GST)", total]],
    columns: [
      { header: "Code", key: "code", width: 12 },
      { header: "Date", key: "date", width: 12 },
      { header: "Category", key: "category", width: 20 },
      { header: "Vendor", key: "vendor", width: 24 },
      { header: "Department", key: "dept", width: 18 },
      { header: "Amount", key: "amount", width: 14, numFmt: "#,##0.00" },
      { header: "Total", key: "total", width: 14, numFmt: "#,##0.00" },
      { header: "Status", key: "status", width: 14 },
    ],
    rows: rows.map((e) => ({
      code: e.expenseCode,
      date: e.expenseDate.toISOString().slice(0, 10),
      category: getExpenseCategoryLabel(e.category),
      vendor: e.vendorName ?? "",
      dept: e.departmentName ?? "",
      amount: e.amount,
      total: e.totalAmount,
      status: getExpenseStatusMeta(e.approvalStatus).label,
    })),
  };
}

async function buildProcurementReport(): Promise<Report> {
  const rows = await exportPurchaseOrders();
  const total = round2(rows.reduce((s, p) => s + p.totalAmount, 0));
  return {
    type: "procurement",
    title: "Procurement Report",
    meta: [["Generated", stamp()], ["Purchase orders", rows.length], ["Total value", total]],
    columns: [
      { header: "PO #", key: "code", width: 12 },
      { header: "Vendor", key: "vendor", width: 28 },
      { header: "Department", key: "dept", width: 18 },
      { header: "Lines", key: "lines", width: 8 },
      { header: "Total", key: "total", width: 14, numFmt: "#,##0.00" },
      { header: "Status", key: "status", width: 18 },
      { header: "Issued", key: "issued", width: 12 },
    ],
    rows: rows.map((p) => ({
      code: p.poNumber,
      vendor: p.vendorName,
      dept: p.departmentName ?? "",
      lines: p.items.length,
      total: p.totalAmount,
      status: getPoStatusMeta(p.status).label,
      issued: p.issuedAt ? p.issuedAt.toISOString().slice(0, 10) : "",
    })),
  };
}

async function buildVendorReport(): Promise<Report> {
  const vendors = await exportVendors();
  const db = await getDb();
  const spendByVendor = await db
    .collection("prms_purchase_orders")
    .aggregate<{ _id: string; total: number }>([
      { $match: { deletedAt: null } },
      { $group: { _id: "$vendorId", total: { $sum: "$totalAmount" } } },
    ])
    .toArray();
  const spendMap = new Map(spendByVendor.map((r) => [r._id, r.total]));
  return {
    type: "vendor",
    title: "Vendor Report",
    meta: [["Generated", stamp()], ["Vendors", vendors.length]],
    columns: [
      { header: "Code", key: "code", width: 12 },
      { header: "Company", key: "company", width: 30 },
      { header: "Category", key: "category", width: 20 },
      { header: "GSTIN", key: "gstin", width: 18 },
      { header: "Rating", key: "rating", width: 8 },
      { header: "Status", key: "status", width: 12 },
      { header: "PO Spend", key: "spend", width: 16, numFmt: "#,##0.00" },
    ],
    rows: vendors.map((v) => ({
      code: v.vendorCode,
      company: v.companyName,
      category: getVendorCategoryLabel(v.category),
      gstin: v.gstin ?? "",
      rating: v.rating ?? "",
      status: v.status,
      spend: round2(spendMap.get(v._id) ?? 0),
    })),
  };
}

async function buildBudgetReport(): Promise<Report> {
  const { items } = await searchBudgets({ pageSize: 100 });
  const rows = items.map(serializeBudget);
  return {
    type: "budget",
    title: "Budget Report",
    meta: [
      ["Generated", stamp()],
      ["Budgets", rows.length],
      ["Allocated", round2(rows.reduce((s, b) => s + b.allocatedAmount, 0))],
      ["Consumed", round2(rows.reduce((s, b) => s + b.consumedAmount, 0))],
    ],
    columns: [
      { header: "Code", key: "code", width: 12 },
      { header: "Name", key: "name", width: 26 },
      { header: "Level", key: "level", width: 14 },
      { header: "Scope", key: "scope", width: 18 },
      { header: "Allocated", key: "allocated", width: 14, numFmt: "#,##0.00" },
      { header: "Consumed", key: "consumed", width: 14, numFmt: "#,##0.00" },
      { header: "Remaining", key: "remaining", width: 14, numFmt: "#,##0.00" },
      { header: "Util %", key: "util", width: 8 },
    ],
    rows: rows.map((b) => ({
      code: b.budgetCode,
      name: b.name,
      level: b.level,
      scope: b.scopeName ?? "—",
      allocated: b.allocatedAmount,
      consumed: b.consumedAmount,
      remaining: b.remaining,
      util: b.utilisation,
    })),
  };
}

async function buildAssetReport(): Promise<Report> {
  const rows = await exportAssets();
  return {
    type: "asset",
    title: "Asset Report",
    meta: [
      ["Generated", stamp()],
      ["Assets", rows.length],
      ["Purchase value", round2(rows.reduce((s, a) => s + a.purchaseCost, 0))],
      ["Book value", round2(rows.reduce((s, a) => s + a.currentValue, 0))],
    ],
    columns: [
      { header: "Code", key: "code", width: 12 },
      { header: "Name", key: "name", width: 26 },
      { header: "Category", key: "category", width: 16 },
      { header: "Purchased", key: "purchased", width: 12 },
      { header: "Cost", key: "cost", width: 14, numFmt: "#,##0.00" },
      { header: "Book Value", key: "value", width: 14, numFmt: "#,##0.00" },
      { header: "Assigned To", key: "assignee", width: 22 },
      { header: "Status", key: "status", width: 14 },
    ],
    rows: rows.map((a) => ({
      code: a.assetCode,
      name: a.name,
      category: a.category,
      purchased: a.purchaseDate.toISOString().slice(0, 10),
      cost: a.purchaseCost,
      value: a.currentValue,
      assignee: a.assignedEmployeeName ?? "",
      status: a.status,
    })),
  };
}

async function buildSaasReport(): Promise<Report> {
  const rows = await listSubscriptions();
  return {
    type: "saas",
    title: "SaaS Subscription Report",
    meta: [
      ["Generated", stamp()],
      ["Subscriptions", rows.length],
      ["Monthly", round2(rows.reduce((s, r) => s + r.monthlyCost, 0))],
      ["Annual", round2(rows.reduce((s, r) => s + r.annualCost, 0))],
    ],
    columns: [
      { header: "Service", key: "name", width: 24 },
      { header: "Provider", key: "provider", width: 18 },
      { header: "Licenses", key: "licenses", width: 10 },
      { header: "Monthly", key: "monthly", width: 14, numFmt: "#,##0.00" },
      { header: "Annual", key: "annual", width: 14, numFmt: "#,##0.00" },
      { header: "Renewal", key: "renewal", width: 12 },
      { header: "Owner", key: "owner", width: 20 },
      { header: "Status", key: "status", width: 12 },
    ],
    rows: rows.map((r) => ({
      name: r.serviceName,
      provider: r.provider,
      licenses: r.licenseCount,
      monthly: r.monthlyCost,
      annual: r.annualCost,
      renewal: r.renewalDate ?? "",
      owner: r.ownerName ?? "",
      status: r.status,
    })),
  };
}

async function buildInfrastructureReport(): Promise<Report> {
  const rows = await listInfrastructure();
  return {
    type: "infrastructure",
    title: "Infrastructure Report",
    meta: [["Generated", stamp()], ["Resources", rows.length], ["Monthly cost", round2(rows.reduce((s, r) => s + r.monthlyCost, 0))]],
    columns: [
      { header: "Name", key: "name", width: 24 },
      { header: "Type", key: "type", width: 16 },
      { header: "Provider", key: "provider", width: 16 },
      { header: "Region", key: "region", width: 14 },
      { header: "Monthly", key: "monthly", width: 14, numFmt: "#,##0.00" },
      { header: "Renewal", key: "renewal", width: 12 },
      { header: "Status", key: "status", width: 12 },
    ],
    rows: rows.map((r) => ({
      name: r.name,
      type: r.resourceType,
      provider: r.provider,
      region: r.region ?? "",
      monthly: r.monthlyCost,
      renewal: r.renewalDate ?? "",
      status: r.status,
    })),
  };
}

async function buildInventoryReport(): Promise<Report> {
  const rows = await exportInventoryItems();
  return {
    type: "inventory",
    title: "Inventory Report",
    meta: [["Generated", stamp()], ["Items", rows.length], ["Stock value", round2(rows.reduce((s, i) => s + i.currentStock * i.unitCost, 0))]],
    columns: [
      { header: "Code", key: "code", width: 12 },
      { header: "Name", key: "name", width: 26 },
      { header: "Category", key: "category", width: 16 },
      { header: "On Hand", key: "stock", width: 10 },
      { header: "Min", key: "min", width: 8 },
      { header: "Unit Cost", key: "cost", width: 12, numFmt: "#,##0.00" },
      { header: "Stock Value", key: "value", width: 14, numFmt: "#,##0.00" },
    ],
    rows: rows.map((i) => ({
      code: i.itemCode,
      name: i.name,
      category: i.category ?? "",
      stock: i.currentStock,
      min: i.minStock,
      cost: i.unitCost,
      value: round2(i.currentStock * i.unitCost),
    })),
  };
}

async function buildInvoiceReport(): Promise<Report> {
  const rows = await exportInvoices();
  return {
    type: "invoice",
    title: "Invoice Report",
    meta: [
      ["Generated", stamp()],
      ["Invoices", rows.length],
      ["Net payable", round2(rows.reduce((s, i) => s + i.netPayable, 0))],
      ["Paid", round2(rows.reduce((s, i) => s + i.amountPaid, 0))],
    ],
    columns: [
      { header: "Invoice #", key: "code", width: 12 },
      { header: "Vendor", key: "vendor", width: 26 },
      { header: "PO", key: "po", width: 12 },
      { header: "Invoice Date", key: "idate", width: 12 },
      { header: "Due", key: "due", width: 12 },
      { header: "Net Payable", key: "net", width: 14, numFmt: "#,##0.00" },
      { header: "Paid", key: "paid", width: 14, numFmt: "#,##0.00" },
      { header: "Status", key: "status", width: 14 },
    ],
    rows: rows.map((i) => ({
      code: i.invoiceNumber,
      vendor: i.vendorName,
      po: i.poNumber ?? "",
      idate: i.invoiceDate,
      due: i.dueDate,
      net: i.netPayable,
      paid: i.amountPaid,
      status: getInvoiceStatusMeta(i.status).label,
    })),
  };
}

async function buildProfitCentreReport(): Promise<Report> {
  const db = await getDb();
  const byDept = await db
    .collection("prms_expenses")
    .aggregate<{ _id: string | null; total: number; count: number }>([
      { $match: { deletedAt: null, approvalStatus: { $in: ["approved", "reimbursed"] } } },
      { $group: { _id: "$departmentName", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ])
    .toArray();
  const poByDept = await db
    .collection("prms_purchase_orders")
    .aggregate<{ _id: string | null; total: number }>([
      { $match: { deletedAt: null, status: { $nin: ["draft", "cancelled"] } } },
      { $group: { _id: "$departmentName", total: { $sum: "$totalAmount" } } },
    ])
    .toArray();
  const poMap = new Map(poByDept.map((r) => [r._id ?? "—", r.total]));

  return {
    type: "profit-center",
    title: "Profit Center Report",
    meta: [["Generated", stamp()], ["Departments", byDept.length]],
    columns: [
      { header: "Department", key: "dept", width: 24 },
      { header: "Expense Entries", key: "count", width: 14 },
      { header: "Expense Spend", key: "expense", width: 16, numFmt: "#,##0.00" },
      { header: "PO Spend", key: "po", width: 16, numFmt: "#,##0.00" },
      { header: "Total Spend", key: "total", width: 16, numFmt: "#,##0.00" },
    ],
    rows: byDept.map((r) => {
      const dept = r._id ?? "Unassigned";
      const po = round2(poMap.get(r._id ?? "—") ?? 0);
      return { dept, count: r.count, expense: round2(r.total), po, total: round2(r.total + po) };
    }),
  };
}
