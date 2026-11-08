import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canViewCosting } from "@/lib/pms-roles";
import { buildProjectReport } from "@/lib/products/sprintos/reports";
import { getPortfolioCosting } from "@/lib/products/sprintos/costing";
import { renderProjectReportPdf } from "@/components/products/sprintos/reports/ProjectReportPdf";
import { buildWorkbook } from "@/lib/products/sprintos/xlsx";
import { toCsv } from "@/lib/csv";
import { recordPdf } from "@/lib/pdf/activity";

type Context = { params: Promise<{ projectId: string }> };

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
  const user = await getCurrentPmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewCosting(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { projectId } = await params;
  const sp = req.nextUrl.searchParams;
  const format = (sp.get("format") ?? "pdf").toLowerCase();
  const dateFrom = sp.get("dateFrom") ?? undefined;
  const dateTo = sp.get("dateTo") ?? undefined;
  const stamp = new Date().toISOString().slice(0, 10);

  // -------- Portfolio --------
  if (projectId === "portfolio") {
    const p = await getPortfolioCosting({ dateFrom, dateTo });
    const rows = p.projects.map((f) => ({
      code: f.projectCode,
      name: f.projectName,
      contractValue: f.contractValue,
      estimatedCost: f.estimatedCost,
      actualCost: f.actualCost,
      revenue: f.revenue,
      estimatedHours: f.estimatedHours,
      actualHours: f.actualHours,
      billableHours: f.billableHours,
      profit: f.profit,
      loss: f.loss,
      profitMargin: f.profitMargin,
    }));

    if (format === "csv") {
      const csv = toCsv(rows, [
        { header: "Code", value: (r) => r.code },
        { header: "Project", value: (r) => r.name },
        { header: "Contract Value", value: (r) => r.contractValue },
        { header: "Estimated Cost", value: (r) => r.estimatedCost },
        { header: "Actual Cost", value: (r) => r.actualCost },
        { header: "Revenue", value: (r) => r.revenue },
        { header: "Estimated Hours", value: (r) => r.estimatedHours },
        { header: "Actual Hours", value: (r) => r.actualHours },
        { header: "Billable Hours", value: (r) => r.billableHours },
        { header: "Profit", value: (r) => r.profit },
        { header: "Loss", value: (r) => r.loss },
        { header: "Margin %", value: (r) => r.profitMargin },
      ]);
      return fileResponse(csv, "text/csv; charset=utf-8", `pms-portfolio-costing-${stamp}.csv`);
    }

    const wb = await buildWorkbook([
      {
        name: "Portfolio Costing",
        meta: [
          ["Total Project Value", p.totalContractValue],
          ["Total Estimated Cost", p.totalEstimatedCost],
          ["Total Actual Cost", p.totalActualCost],
          ["Total Profit", p.totalProfit],
          ["Total Loss", p.totalLoss],
          ["Profit Margin %", p.profitMargin],
          ["Range", dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : "All time"],
        ],
        columns: [
          { header: "Code", key: "code", width: 12 },
          { header: "Project", key: "name", width: 30 },
          { header: "Contract Value", key: "contractValue", width: 16, numFmt: "#,##0" },
          { header: "Estimated Cost", key: "estimatedCost", width: 16, numFmt: "#,##0" },
          { header: "Actual Cost", key: "actualCost", width: 16, numFmt: "#,##0" },
          { header: "Revenue", key: "revenue", width: 14, numFmt: "#,##0" },
          { header: "Est. Hours", key: "estimatedHours", width: 12 },
          { header: "Actual Hours", key: "actualHours", width: 12 },
          { header: "Billable Hours", key: "billableHours", width: 14 },
          { header: "Profit", key: "profit", width: 14, numFmt: "#,##0" },
          { header: "Loss", key: "loss", width: 14, numFmt: "#,##0" },
          { header: "Margin %", key: "profitMargin", width: 10 },
        ],
        rows,
      },
    ]);
    return fileResponse(wb, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `pms-portfolio-costing-${stamp}.xlsx`);
  }

  // -------- Single project --------
  const report = await buildProjectReport(projectId, { dateFrom, dateTo });
  if (!report) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const base = `${report.summary.projectCode}-report-${stamp}`;
  const f = report.financials;

  if (format === "pdf") {
    const buffer = await renderProjectReportPdf(report);
    await recordPdf({ type: "pms_report", ref: report.summary.projectCode, by: user.email, role: "staff" });
    return fileResponse(buffer, "application/pdf", `${base}.pdf`);
  }

  if (format === "csv") {
    const lines: string[] = [
      `Project,${report.summary.name}`,
      `Code,${report.summary.projectCode}`,
      `Client,${report.summary.client}`,
      `Manager,${report.summary.manager}`,
      `Status,${report.summary.statusLabel}`,
      `Progress,${report.summary.progressPercent}%`,
      "",
      `Contract Value,${f.contractValue}`,
      `Estimated Cost,${f.estimatedCost}`,
      `Actual Cost,${f.actualCost}`,
      `Revenue,${f.revenue}`,
      `Profit,${f.profit}`,
      `Loss,${f.loss}`,
      `Profit Margin %,${f.profitMargin}`,
      `Estimated Hours,${f.estimatedHours}`,
      `Logged Hours,${f.actualHours}`,
      `Billable Hours,${f.billableHours}`,
      "",
      "Employee,Role,Hours,Billable Hours,Cost,Revenue",
      ...report.contributions.map((c) => `${c.name},${c.role},${c.hours},${c.billableHours},${c.cost},${c.revenue}`),
    ];
    return fileResponse(lines.join("\r\n"), "text/csv; charset=utf-8", `${base}.csv`);
  }

  // xlsx
  const wb = await buildWorkbook([
    {
      name: "Summary",
      meta: [
        ["Project", report.summary.name],
        ["Code", report.summary.projectCode],
        ["Client", report.summary.client],
        ["Manager", report.summary.manager],
        ["Status", report.summary.statusLabel],
        ["Progress %", report.summary.progressPercent],
        ["Contract Value", f.contractValue],
        ["Estimated Cost", f.estimatedCost],
        ["Actual Cost", f.actualCost],
        ["Revenue", f.revenue],
        ["Profit", f.profit],
        ["Loss", f.loss],
        ["Profit Margin %", f.profitMargin],
        ["Estimated Hours", f.estimatedHours],
        ["Logged Hours", f.actualHours],
        ["Billable Hours", f.billableHours],
      ],
      columns: [
        { header: "Metric", key: "k", width: 26 },
        { header: "Value", key: "v", width: 22 },
      ],
      rows: report.taskProgress.map((t) => ({ k: `Tasks — ${t.label}`, v: t.count })),
    },
    {
      name: "Contributions",
      columns: [
        { header: "Employee", key: "name", width: 26 },
        { header: "Role", key: "role", width: 16 },
        { header: "Hours", key: "hours", width: 10 },
        { header: "Billable Hours", key: "billableHours", width: 14 },
        { header: "Cost Rate", key: "costRate", width: 12 },
        { header: "Bill Rate", key: "billRate", width: 12 },
        { header: "Cost", key: "cost", width: 14, numFmt: "#,##0" },
        { header: "Revenue", key: "revenue", width: 14, numFmt: "#,##0" },
      ],
      rows: report.contributions as unknown as Record<string, unknown>[],
    },
  ]);
  return fileResponse(wb, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${base}.xlsx`);
}

export const GET = withTransport(handleGET);
