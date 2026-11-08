import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canViewReports } from "@/lib/fms-roles";
import { toCsv } from "@/lib/csv";
import { buildWorkbook, type SheetSpec } from "@/lib/products/cashflow-ai/xlsx";
import { renderFmsReportPdf, type FmsReportPdfData } from "@/components/products/cashflow-ai/reports/FmsReportPdf";
import { getProfitAndLoss } from "@/lib/products/cashflow-ai/reports/profit-and-loss";
import { getTaxSummary } from "@/lib/products/cashflow-ai/reports/tax";
import { getBudgetVsActual } from "@/lib/products/cashflow-ai/reports/budget-vs-actual";
import { recordPdf } from "@/lib/pdf/activity";

type Context = { params: Promise<{ type: string }> };

/**
 * FMS's export capability for `revenue`/`expense`/`tax`/`budget-vs-actual`.
 * CSV shipped first (Phase 7); this fast-follow adds `xlsx`/`pdf` for the
 * same 4 types, reusing `fms/xlsx.ts` (mirrors `pms/xlsx.ts`) and the
 * generic `FmsReportPdf.tsx` renderer — not expanding to new report types.
 */
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

async function handleGET(req: NextRequest, { params }: Context) {
  const user = await getCurrentFmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewReports(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type } = await params;
  const sp = req.nextUrl.searchParams;
  const format = (sp.get("format") ?? "csv").toLowerCase();
  if (format !== "csv" && format !== "xlsx" && format !== "pdf") {
    return NextResponse.json({ error: "format must be csv, xlsx or pdf." }, { status: 400 });
  }

  const dateFromStr = sp.get("dateFrom");
  const dateToStr = sp.get("dateTo");
  const dateFrom = dateFromStr ? new Date(`${dateFromStr}T00:00:00`) : undefined;
  const dateTo = dateToStr ? new Date(`${dateToStr}T23:59:59`) : undefined;
  const rangeLabel = dateFromStr && dateToStr ? `${dateFromStr} to ${dateToStr}` : "All time";
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `fms-${type}-report-${stamp}`;

  if (type === "revenue" || type === "expense") {
    const pl = await getProfitAndLoss({ dateFrom, dateTo });
    const rows = type === "revenue" ? pl.income : pl.expenses;
    const total = type === "revenue" ? pl.totalIncome : pl.totalExpenses;
    const totalLabel = type === "revenue" ? "Total Income" : "Total Expenses";

    if (format === "csv") {
      const csv = toCsv(rows, [
        { header: "Account Code", value: (r) => r.accountCode },
        { header: "Account Name", value: (r) => r.accountName },
        { header: "Amount", value: (r) => r.amount },
      ]);
      return fileResponse(csv, "text/csv; charset=utf-8", `${base}.csv`);
    }
    if (format === "xlsx") {
      const sheet: SheetSpec = {
        name: type === "revenue" ? "Revenue" : "Expense",
        meta: [["Range", rangeLabel], [totalLabel, total]],
        columns: [
          { header: "Account Code", key: "accountCode", width: 14 },
          { header: "Account Name", key: "accountName", width: 30 },
          { header: "Amount", key: "amount", width: 16, numFmt: "#,##0" },
        ],
        rows: rows as unknown as Record<string, unknown>[],
      };
      const wb = await buildWorkbook([sheet]);
      return fileResponse(wb, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${base}.xlsx`);
    }
    const pdfData: FmsReportPdfData = {
      title: type === "revenue" ? "Revenue Report" : "Expense Report",
      subtitle: rangeLabel,
      sections: [{ rows: rows.map((r) => ({ label: `${r.accountCode} ${r.accountName}`, value: r.amount })) }],
      total: { label: totalLabel, value: total },
    };
    const buffer = await renderFmsReportPdf(pdfData);
    await recordPdf({ type: "fms_report", variant: type, ref: base, by: user.email, role: "staff" });
    return fileResponse(buffer, "application/pdf", `${base}.pdf`);
  }

  if (type === "tax") {
    const summary = await getTaxSummary({ dateFrom, dateTo });
    const rows = [
      { label: "Tax Collected", value: summary.taxCollected },
      { label: "Tax Paid", value: summary.taxPaid },
      { label: "Net Payable", value: summary.netPayable },
    ];

    if (format === "csv") {
      const csv = toCsv(rows, [
        { header: "Metric", value: (r) => r.label },
        { header: "Amount", value: (r) => r.value },
      ]);
      return fileResponse(csv, "text/csv; charset=utf-8", `${base}.csv`);
    }
    if (format === "xlsx") {
      const wb = await buildWorkbook([
        {
          name: "Tax Report",
          meta: [["Range", rangeLabel]],
          columns: [
            { header: "Metric", key: "label", width: 22 },
            { header: "Amount", key: "value", width: 16, numFmt: "#,##0" },
          ],
          rows,
        },
      ]);
      return fileResponse(wb, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${base}.xlsx`);
    }
    const buffer = await renderFmsReportPdf({
      title: "Tax Report",
      subtitle: rangeLabel,
      sections: [{ rows }],
      total: { label: "Net Payable", value: summary.netPayable },
    });
    await recordPdf({ type: "fms_report", variant: type, ref: base, by: user.email, role: "staff" });
    return fileResponse(buffer, "application/pdf", `${base}.pdf`);
  }

  if (type === "budget-vs-actual") {
    const result = await getBudgetVsActual();

    if (format === "csv") {
      const csv = toCsv(result.rows, [
        { header: "Budget", value: (r) => r.name },
        { header: "Level", value: (r) => r.level },
        { header: "Period Start", value: (r) => r.periodStart.slice(0, 10) },
        { header: "Period End", value: (r) => r.periodEnd.slice(0, 10) },
        { header: "Allocated", value: (r) => r.allocated },
        { header: "Actual", value: (r) => r.actual },
        { header: "Variance", value: (r) => r.variance },
        { header: "Utilisation %", value: (r) => r.utilisationPercent },
      ]);
      return fileResponse(csv, "text/csv; charset=utf-8", `${base}.csv`);
    }
    if (format === "xlsx") {
      const wb = await buildWorkbook([
        {
          name: "Budget vs Actual",
          columns: [
            { header: "Budget", key: "name", width: 26 },
            { header: "Level", key: "level", width: 12 },
            { header: "Period Start", key: "periodStart", width: 14 },
            { header: "Period End", key: "periodEnd", width: 14 },
            { header: "Allocated", key: "allocated", width: 14, numFmt: "#,##0" },
            { header: "Actual", key: "actual", width: 14, numFmt: "#,##0" },
            { header: "Variance", key: "variance", width: 14, numFmt: "#,##0" },
            { header: "Utilisation %", key: "utilisationPercent", width: 14 },
          ],
          rows: result.rows.map((r) => ({ ...r, periodStart: r.periodStart.slice(0, 10), periodEnd: r.periodEnd.slice(0, 10) })),
        },
      ]);
      return fileResponse(wb, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${base}.xlsx`);
    }
    const buffer = await renderFmsReportPdf({
      title: "Budget vs Actual",
      sections: [
        {
          rows: result.rows.map((r) => ({
            label: `${r.name} (${r.level}) — Allocated ${r.allocated}, Actual ${r.actual}`,
            value: r.variance,
          })),
        },
      ],
    });
    await recordPdf({ type: "fms_report", variant: type, ref: base, by: user.email, role: "staff" });
    return fileResponse(buffer, "application/pdf", `${base}.pdf`);
  }

  return NextResponse.json({ error: `Unknown report type "${type}".` }, { status: 404 });
}

export const GET = withTransport(handleGET);
