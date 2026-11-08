import { NextRequest, NextResponse } from "next/server";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { formatInvoiceDate, listSaasInvoices, type SaasInvoiceRow } from "@/lib/platform/billing/invoices";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { parseInvoiceFilters } from "../filters";

const rupees = (paise: number) => (paise / 100).toFixed(2);
/** Text cells can't start a spreadsheet formula (CSV injection via company names etc.). */
const text = (v: string | null | undefined) => {
  const s = v ?? "";
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

const COLUMNS: CsvColumn<SaasInvoiceRow>[] = [
  { header: "Type", value: (r) => (r.kind === "credit_note" ? "Credit note" : "Invoice") },
  { header: "Number", value: (r) => text(r.number) },
  { header: "Date", value: (r) => formatInvoiceDate(r.issuedAt) },
  { header: "Financial year", value: (r) => r.financialYear },
  { header: "Status", value: (r) => r.status },
  { header: "Against invoice", value: (r) => text(r.original?.number) },
  { header: "Company", value: (r) => text(r.companyName) },
  { header: "Buyer legal name", value: (r) => text(r.buyer.legalName) },
  { header: "Buyer GSTIN", value: (r) => r.buyer.gstin ?? "" },
  { header: "Place of supply", value: (r) => (r.placeOfSupply ? `${r.placeOfSupply.code}-${r.placeOfSupply.name}` : "") },
  { header: "Supply type", value: (r) => (r.supplyType === "intra" ? "Intra-state" : "Inter-state") },
  { header: "Plan", value: (r) => text(r.planName) },
  { header: "Interval", value: (r) => r.interval ?? "" },
  { header: "Period start", value: (r) => (r.periodStart ? formatInvoiceDate(r.periodStart) : "") },
  { header: "Period end", value: (r) => (r.periodEnd ? formatInvoiceDate(r.periodEnd) : "") },
  { header: "SAC", value: (r) => r.sac },
  { header: "GST rate %", value: (r) => r.taxRatePercent },
  { header: "Currency", value: (r) => r.currency },
  { header: "Taxable value", value: (r) => rupees(r.taxable) },
  { header: "CGST", value: (r) => rupees(r.cgst) },
  { header: "SGST", value: (r) => rupees(r.sgst) },
  { header: "IGST", value: (r) => rupees(r.igst) },
  { header: "Total tax", value: (r) => rupees(r.taxTotal) },
  { header: "Total", value: (r) => rupees(r.total) },
  { header: "Paid on", value: (r) => (r.paidAt ? formatInvoiceDate(r.paidAt) : "") },
  { header: "Payment ref", value: (r) => text(r.paymentRef) },
  { header: "Refund ref", value: (r) => text(r.refundRef) },
];

/** CSV of every SaaS invoice / credit note matching the Platform Console filters. Needs the platform `invoices.read` permission. */
export async function GET(req: NextRequest) {
  if (!(await isPlatformOwnerContext())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // The same permission as the invoices page itself — a revoked or limited platform role can't export.
  const auth = await checkPlatformPermission("invoices.read");
  if (!auth.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = auth.user;

  const { filter, values } = parseInvoiceFilters(req.nextUrl.searchParams);
  const { rows } = await listSaasInvoices(filter, { pageSize: 50_000 });
  await recordPlatformAudit({ actorId: user.id, action: "invoice.export", target: { type: "saas_invoices", id: "csv" }, details: { rows: rows.length, filters: values } });
  const csv = toCsv([...rows].reverse(), COLUMNS);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="saas-invoices${values.fy ? `-${values.fy}` : ""}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
