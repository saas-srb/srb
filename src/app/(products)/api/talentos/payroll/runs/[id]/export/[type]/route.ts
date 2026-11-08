import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canRunPayroll } from "@/lib/hrms-roles";
import { getPayslipsForRun, getRun } from "@/lib/products/talentos/payroll-run";
import { exportSlipsForRun } from "@/lib/products/talentos/payroll-export-data";
import { ecrFile, esiFile, journalCsv, payrollJournal, payrollRegister, professionalTaxReport, tdsRegister } from "@/lib/products/talentos/payroll/exports";
import { recordAudit } from "@/lib/products/talentos/audit";

type Context = { params: Promise<{ id: string; type: string }> };

/** Files that go to other people need an approved run: a draft can still change. */
const NEEDS_APPROVAL = new Set(["pf-ecr", "esi"]);
const TYPES = new Set(["register", "pf-ecr", "esi", "pt", "tds", "journal"]);

async function handleGET(_req: NextRequest, { params }: Context) {
  const user = await getCurrentHrmsUser();
  if (!user || !canRunPayroll(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, type } = await params;
  if (!TYPES.has(type)) return NextResponse.json({ error: "Unknown export." }, { status: 404 });
  const run = await getRun(id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (NEEDS_APPROVAL.has(type) && run.status === "draft") return NextResponse.json({ error: "Approve the run before exporting a return: a draft can still change." }, { status: 400 });

  const slips = await exportSlipsForRun(await getPayslipsForRun(id));
  let body = "";
  let ext = "csv";
  let mime = "text/csv; charset=utf-8";
  let note = "";
  if (type === "pf-ecr") {
    const r = ecrFile(slips);
    body = r.text;
    ext = "txt";
    mime = "text/plain; charset=utf-8";
    note = r.skipped.length ? `, ${r.skipped.length} left out (no UAN)` : "";
  } else if (type === "esi") {
    const r = esiFile(slips);
    body = r.text;
    note = r.skipped.length ? `, ${r.skipped.length} left out (no ESI number)` : "";
  } else if (type === "pt") body = professionalTaxReport(slips);
  else if (type === "tds") body = tdsRegister(slips);
  else if (type === "journal") body = journalCsv(payrollJournal(slips));
  else body = payrollRegister(slips);

  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "view_sensitive", entity: "payroll_run", entityId: run._id, entityLabel: `${type} export — ${run.month}`, summary: `Exported ${slips.length} employee(s)${note}` });
  return new NextResponse(body, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="payroll-${type}-${run.month}${run.status === "draft" ? "-DRAFT" : ""}.${ext}"`,
      "Cache-Control": "no-store",
      ...(note ? { "X-Export-Note": note.replace(/^, /, "") } : {}),
    },
  });
}

export const GET = withTransport(handleGET);
