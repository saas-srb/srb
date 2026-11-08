import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement, canApproveRequisitions, canManageExpenses, canManageFinance } from "@/lib/prms-roles";
import { exportVendors } from "@/lib/products/spendiq/vendors";
import { exportRequisitions } from "@/lib/products/spendiq/requisitions";
import { exportPurchaseOrders } from "@/lib/products/spendiq/purchase-orders";
import { exportExpenses } from "@/lib/products/spendiq/expenses";
import { exportAssets } from "@/lib/products/spendiq/assets";
import { exportInventoryItems } from "@/lib/products/spendiq/inventory";
import { exportInvoices } from "@/lib/products/spendiq/invoices";
import { exportPayments } from "@/lib/products/spendiq/payments";
import { buildWorkbook, type SheetColumn } from "@/lib/products/spendiq/xlsx";
import { toCsv } from "@/lib/csv";
import {
  getVendorCategoryLabel,
  getExpenseCategoryLabel,
  getRequisitionStatusMeta,
  getPriorityMeta,
  getPoStatusMeta,
  getExpenseStatusMeta,
  getAssetStatusMeta,
  getInvoiceStatusMeta,
} from "@/lib/products/spendiq/constants";

type Context = { params: Promise<{ entity: string }> };

function fileResponse(body: Buffer | string, type: string, filename: string) {
  const payload = typeof body === "string" ? body : new Uint8Array(body);
  return new NextResponse(payload, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

interface ExportSpec {
  title: string;
  columns: SheetColumn[];
  rows: Record<string, unknown>[];
}

async function buildVendorExport(): Promise<ExportSpec> {
  const vendors = await exportVendors();
  return {
    title: "Vendors",
    columns: [
      { header: "Code", key: "code", width: 12 },
      { header: "Company", key: "company", width: 32 },
      { header: "Category", key: "category", width: 20 },
      { header: "GSTIN", key: "gstin", width: 18 },
      { header: "PAN", key: "pan", width: 14 },
      { header: "Contact", key: "contact", width: 20 },
      { header: "Email", key: "email", width: 26 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Payment Terms", key: "terms", width: 14 },
      { header: "Rating", key: "rating", width: 8 },
      { header: "Status", key: "status", width: 12 },
    ],
    rows: vendors.map((v) => ({
      code: v.vendorCode,
      company: v.companyName,
      category: getVendorCategoryLabel(v.category),
      gstin: v.gstin ?? "",
      pan: v.pan ?? "",
      contact: v.contactPerson ?? "",
      email: v.email ?? "",
      phone: v.phone ?? "",
      terms: v.paymentTerms,
      rating: v.rating ?? "",
      status: v.status,
    })),
  };
}

async function buildRequisitionExport(): Promise<ExportSpec> {
  const reqs = await exportRequisitions();
  return {
    title: "Requisitions",
    columns: [
      { header: "PR", key: "code", width: 12 },
      { header: "Item", key: "item", width: 30 },
      { header: "Department", key: "department", width: 20 },
      { header: "Category", key: "category", width: 20 },
      { header: "Qty", key: "qty", width: 8 },
      { header: "Est. Cost", key: "cost", width: 14, numFmt: "#,##0.00" },
      { header: "Currency", key: "currency", width: 10 },
      { header: "Priority", key: "priority", width: 12 },
      { header: "Required By", key: "required", width: 14 },
      { header: "Requested By", key: "requester", width: 22 },
      { header: "Status", key: "status", width: 18 },
    ],
    rows: reqs.map((r) => ({
      code: r.prCode,
      item: r.itemName,
      department: r.departmentName ?? "",
      category: getExpenseCategoryLabel(r.category),
      qty: r.quantity,
      cost: r.estimatedCost,
      currency: r.currency,
      priority: getPriorityMeta(r.priority).label,
      required: r.requiredDate ?? "",
      requester: r.requestedBy?.name ?? "",
      status: getRequisitionStatusMeta(r.status).label,
    })),
  };
}

async function buildPoExport(): Promise<ExportSpec> {
  const pos = await exportPurchaseOrders();
  return {
    title: "Purchase Orders",
    columns: [
      { header: "PO #", key: "code", width: 12 },
      { header: "Vendor", key: "vendor", width: 30 },
      { header: "Lines", key: "lines", width: 8 },
      { header: "Subtotal", key: "subtotal", width: 14, numFmt: "#,##0.00" },
      { header: "GST", key: "gst", width: 12, numFmt: "#,##0.00" },
      { header: "Total", key: "total", width: 14, numFmt: "#,##0.00" },
      { header: "Currency", key: "currency", width: 10 },
      { header: "Status", key: "status", width: 18 },
      { header: "Issued", key: "issued", width: 14 },
    ],
    rows: pos.map((p) => ({
      code: p.poNumber,
      vendor: p.vendorName,
      lines: p.items.length,
      subtotal: p.subtotal,
      gst: p.gstAmount,
      total: p.totalAmount,
      currency: p.currency,
      status: getPoStatusMeta(p.status).label,
      issued: p.issuedAt ? p.issuedAt.toISOString().slice(0, 10) : "",
    })),
  };
}

async function buildExpenseExport(): Promise<ExportSpec> {
  const expenses = await exportExpenses();
  return {
    title: "Expenses",
    columns: [
      { header: "Code", key: "code", width: 12 },
      { header: "Date", key: "date", width: 12 },
      { header: "Category", key: "category", width: 20 },
      { header: "Subcategory", key: "sub", width: 18 },
      { header: "Vendor", key: "vendor", width: 26 },
      { header: "Department", key: "dept", width: 18 },
      { header: "Amount", key: "amount", width: 14, numFmt: "#,##0.00" },
      { header: "GST", key: "gst", width: 12, numFmt: "#,##0.00" },
      { header: "Total", key: "total", width: 14, numFmt: "#,##0.00" },
      { header: "Type", key: "type", width: 12 },
      { header: "Status", key: "status", width: 14 },
    ],
    rows: expenses.map((e) => ({
      code: e.expenseCode,
      date: e.expenseDate.toISOString().slice(0, 10),
      category: getExpenseCategoryLabel(e.category),
      sub: e.subcategory ?? "",
      vendor: e.vendorName ?? "",
      dept: e.departmentName ?? "",
      amount: e.amount,
      gst: e.gstAmount,
      total: e.totalAmount,
      type: e.expenseType === "recurring" ? "Recurring" : "One-time",
      status: getExpenseStatusMeta(e.approvalStatus).label,
    })),
  };
}

async function buildAssetExport(): Promise<ExportSpec> {
  const assets = await exportAssets();
  return {
    title: "Assets",
    columns: [
      { header: "Code", key: "code", width: 12 },
      { header: "Name", key: "name", width: 28 },
      { header: "Category", key: "category", width: 16 },
      { header: "Serial", key: "serial", width: 18 },
      { header: "Purchased", key: "purchased", width: 12 },
      { header: "Cost", key: "cost", width: 14, numFmt: "#,##0.00" },
      { header: "Book Value", key: "value", width: 14, numFmt: "#,##0.00" },
      { header: "Assigned To", key: "assignee", width: 22 },
      { header: "Status", key: "status", width: 14 },
    ],
    rows: assets.map((a) => ({
      code: a.assetCode,
      name: a.name,
      category: a.category,
      serial: a.serialNumber ?? "",
      purchased: a.purchaseDate.toISOString().slice(0, 10),
      cost: a.purchaseCost,
      value: a.currentValue,
      assignee: a.assignedEmployeeName ?? "",
      status: getAssetStatusMeta(a.status).label,
    })),
  };
}

async function buildInventoryExport(): Promise<ExportSpec> {
  const items = await exportInventoryItems();
  return {
    title: "Inventory",
    columns: [
      { header: "Code", key: "code", width: 12 },
      { header: "Name", key: "name", width: 28 },
      { header: "Category", key: "category", width: 16 },
      { header: "On Hand", key: "stock", width: 10 },
      { header: "Min", key: "min", width: 8 },
      { header: "Unit Cost", key: "cost", width: 12, numFmt: "#,##0.00" },
      { header: "Stock Value", key: "value", width: 14, numFmt: "#,##0.00" },
      { header: "Vendor", key: "vendor", width: 24 },
    ],
    rows: items.map((i) => ({
      code: i.itemCode,
      name: i.name,
      category: i.category ?? "",
      stock: i.currentStock,
      min: i.minStock,
      cost: i.unitCost,
      value: Math.round(i.currentStock * i.unitCost * 100) / 100,
      vendor: i.vendorName ?? "",
    })),
  };
}

async function buildInvoiceExport(): Promise<ExportSpec> {
  const invoices = await exportInvoices();
  return {
    title: "Invoices",
    columns: [
      { header: "Invoice #", key: "code", width: 12 },
      { header: "Vendor Inv #", key: "vinv", width: 16 },
      { header: "Vendor", key: "vendor", width: 26 },
      { header: "PO", key: "po", width: 12 },
      { header: "Invoice Date", key: "idate", width: 12 },
      { header: "Due Date", key: "due", width: 12 },
      { header: "Total", key: "total", width: 14, numFmt: "#,##0.00" },
      { header: "TDS", key: "tds", width: 12, numFmt: "#,##0.00" },
      { header: "Net Payable", key: "net", width: 14, numFmt: "#,##0.00" },
      { header: "Paid", key: "paid", width: 14, numFmt: "#,##0.00" },
      { header: "Status", key: "status", width: 16 },
    ],
    rows: invoices.map((i) => ({
      code: i.invoiceNumber,
      vinv: i.vendorInvoiceNumber ?? "",
      vendor: i.vendorName,
      po: i.poNumber ?? "",
      idate: i.invoiceDate,
      due: i.dueDate,
      total: i.totalAmount,
      tds: i.tdsAmount,
      net: i.netPayable,
      paid: i.amountPaid,
      status: getInvoiceStatusMeta(i.status).label,
    })),
  };
}

async function buildPaymentExport(): Promise<ExportSpec> {
  const payments = await exportPayments();
  return {
    title: "Payments",
    columns: [
      { header: "Payment #", key: "code", width: 12 },
      { header: "Invoice #", key: "inv", width: 12 },
      { header: "Vendor", key: "vendor", width: 26 },
      { header: "Date", key: "date", width: 12 },
      { header: "Amount", key: "amount", width: 14, numFmt: "#,##0.00" },
      { header: "TDS", key: "tds", width: 12, numFmt: "#,##0.00" },
      { header: "Method", key: "method", width: 14 },
      { header: "Reference", key: "ref", width: 20 },
      { header: "Status", key: "status", width: 12 },
    ],
    rows: payments.map((p) => ({
      code: p.paymentCode,
      inv: p.invoiceNumber,
      vendor: p.vendorName,
      date: p.paymentDate.toISOString().slice(0, 10),
      amount: p.amount,
      tds: p.tdsDeducted,
      method: p.method,
      ref: p.transactionReference ?? "",
      status: p.status,
    })),
  };
}

async function handleGET(req: NextRequest, { params }: Context) {
  const user = await getCurrentPrmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { entity } = await params;
  const format = (req.nextUrl.searchParams.get("format") ?? "csv").toLowerCase();

  let spec: ExportSpec;
  if (entity === "vendors") {
    if (!canManageProcurement(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    spec = await buildVendorExport();
  } else if (entity === "requisitions") {
    if (!canApproveRequisitions(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    spec = await buildRequisitionExport();
  } else if (entity === "purchase-orders") {
    if (!canManageProcurement(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    spec = await buildPoExport();
  } else if (entity === "expenses") {
    if (!canManageExpenses(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    spec = await buildExpenseExport();
  } else if (entity === "assets") {
    if (!canManageProcurement(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    spec = await buildAssetExport();
  } else if (entity === "inventory") {
    if (!canManageProcurement(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    spec = await buildInventoryExport();
  } else if (entity === "invoices") {
    if (!canManageFinance(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    spec = await buildInvoiceExport();
  } else if (entity === "payments") {
    if (!canManageFinance(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    spec = await buildPaymentExport();
  } else {
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `prms-${entity}-${stamp}`;

  if (format === "csv") {
    const csv = toCsv(spec.rows, spec.columns.map((c) => ({ header: c.header, value: (r: Record<string, unknown>) => r[c.key] })));
    return fileResponse(csv, "text/csv; charset=utf-8", `${base}.csv`);
  }

  const wb = await buildWorkbook([{ name: spec.title, columns: spec.columns, rows: spec.rows }]);
  return fileResponse(wb, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${base}.xlsx`);
}

export const GET = withTransport(handleGET);
