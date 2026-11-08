import { NextResponse, type NextRequest } from "next/server";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { getRevenueDashboard, listCompanyRevenue, type MonthRow } from "@/lib/platform/billing/metrics";
import { toCsv } from "@/lib/csv";

/**
 * CSV export for /console/revenue.
 *   ?kind=months (default) — one row per month of the selected range (same range params as the page)
 *   ?kind=companies        — every customer company's current subscription and MRR
 * Route handlers aren't covered by the product layout's guard, so this checks access itself.
 * Money columns are in currency units (rupees) with two decimals, ready for a spreadsheet.
 */
export const dynamic = "force-dynamic";

const units = (paise: number) => (paise / 100).toFixed(2);
const rate = (v: number | null) => (v === null ? "" : (v * 100).toFixed(2));
const iso = (d: Date | null) => (d ? d.toISOString() : "");

function csvResponse(csv: string, filename: string) {
  return new NextResponse(`﻿${csv}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest) {
  await requirePlatformPermission("revenue.read");
  const sp = req.nextUrl.searchParams;

  if (sp.get("kind") === "companies") {
    const rows = await listCompanyRevenue();
    const csv = toCsv(rows, [
      { header: "Company", value: (r) => r.name },
      { header: "Slug", value: (r) => r.slug },
      { header: "Status", value: (r) => r.status },
      { header: "Plan", value: (r) => r.planName },
      { header: "Billing cycle", value: (r) => r.interval },
      { header: "MRR", value: (r) => units(r.mrr) },
      { header: "ARR", value: (r) => units(r.mrr * 12) },
      { header: "Trial ends", value: (r) => iso(r.trialEndsAt) },
      { header: "Grace ends", value: (r) => iso(r.graceEndsAt) },
      { header: "Current period ends", value: (r) => iso(r.currentPeriodEnd) },
      { header: "Signed up", value: (r) => iso(r.createdAt) },
    ]);
    return csvResponse(csv, "subscriptions-by-company.csv");
  }

  const d = await getRevenueDashboard({ range: sp.get("range"), from: sp.get("from"), to: sp.get("to") });
  const csv = toCsv<MonthRow>(d.months, [
    { header: "Month", value: (r) => r.key },
    { header: `MRR at month end (${d.currency})`, value: (r) => units(r.mrr) },
    { header: "MRR at month start", value: (r) => units(r.startMrr) },
    { header: "New MRR", value: (r) => units(r.new) },
    { header: "Expansion MRR", value: (r) => units(r.expansion) },
    { header: "Contraction MRR", value: (r) => units(r.contraction) },
    { header: "Churned MRR", value: (r) => units(r.churn) },
    { header: "Net new MRR", value: (r) => units(r.net) },
    { header: "Paying companies at start", value: (r) => r.payingAtStart },
    { header: "Churned companies", value: (r) => r.churnedLogos },
    { header: "Logo churn %", value: (r) => rate(r.logoChurnRate) },
    { header: "Revenue churn %", value: (r) => rate(r.revenueChurnRate) },
    { header: "Trials started", value: (r) => r.trialsStarted },
    { header: "Invoices issued", value: (r) => r.invoicesIssued },
    { header: "Billed incl. GST", value: (r) => units(r.billed) },
    { header: "GST billed", value: (r) => units(r.billedTax) },
    { header: "Invoices paid", value: (r) => r.invoicesPaid },
    { header: "Collected incl. GST", value: (r) => units(r.collected) },
    { header: "GST collected", value: (r) => units(r.collectedTax) },
  ]);
  return csvResponse(csv, `revenue-${d.range.from}-to-${d.range.to}.csv`);
}
