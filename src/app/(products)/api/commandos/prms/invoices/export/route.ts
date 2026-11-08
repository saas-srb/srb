import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportInvoices } from "@/lib/products/spendiq/invoices";
import { getInvoiceStatusMeta, isValidInvoiceStatus } from "@/lib/products/spendiq/constants";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.prms.invoices");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportInvoices({
    search: sp.get("search") ?? undefined,
    status: status && isValidInvoiceStatus(status) ? status : undefined,
    ids,
  });

  const csv = toCsv(rows, [
    { header: "Invoice Number", value: (r) => r.invoiceNumber },
    { header: "Vendor Invoice #", value: (r) => r.vendorInvoiceNumber ?? "" },
    { header: "Vendor", value: (r) => r.vendorName },
    { header: "PO Number", value: (r) => r.poNumber ?? "" },
    { header: "Invoice Date", value: (r) => r.invoiceDate },
    { header: "Due Date", value: (r) => r.dueDate },
    { header: "Subtotal", value: (r) => String(r.subtotal) },
    { header: "GST", value: (r) => String(r.gstAmount) },
    { header: "TDS", value: (r) => String(r.tdsAmount) },
    { header: "Total", value: (r) => String(r.totalAmount) },
    { header: "Net Payable", value: (r) => String(r.netPayable) },
    { header: "Amount Paid", value: (r) => String(r.amountPaid) },
    { header: "Currency", value: (r) => r.currency },
    { header: "Status", value: (r) => getInvoiceStatusMeta(r.status).label },
  ]);

  const filename = `admin-prms-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
