import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageTraining } from "@/lib/tms-roles";
import { buildReport, isValidReportType } from "@/lib/products/cohort-ai/reports";
import { buildWorkbook } from "@/lib/products/cohort-ai/xlsx";
import { renderReportPdf } from "@/components/products/cohort-ai/ReportPdf";
import { toCsv } from "@/lib/csv";
import { recordPdf } from "@/lib/pdf/activity";

type Context = { params: Promise<{ type: string }> };

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
  const user = await getCurrentTmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageTraining(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type } = await params;
  if (!isValidReportType(type)) return NextResponse.json({ error: "Unknown report" }, { status: 404 });

  const format = (req.nextUrl.searchParams.get("format") ?? "csv").toLowerCase();
  const report = await buildReport(type);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `tms-${type}-report-${stamp}`;

  if (format === "csv") {
    const csv = toCsv(report.rows, report.columns.map((c) => ({ header: c.header, value: (r) => r[c.key] })));
    const preamble = report.meta.map(([k, v]) => `${k},${v}`).join("\r\n");
    return fileResponse(`${preamble}\r\n\r\n${csv}`, "text/csv; charset=utf-8", `${base}.csv`);
  }

  if (format === "pdf") {
    const buffer = await renderReportPdf(report);
    await recordPdf({ type: "tms_report", variant: type, ref: base, by: user.email, role: "staff" });
    return fileResponse(buffer, "application/pdf", `${base}.pdf`);
  }

  // xlsx
  const wb = await buildWorkbook([
    {
      name: report.title,
      meta: report.meta,
      columns: report.columns.map((c) => ({ header: c.header, key: c.key, width: c.width, numFmt: c.numFmt })),
      rows: report.rows,
    },
  ]);
  return fileResponse(wb, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${base}.xlsx`);
}

export const GET = withTransport(handleGET);
