import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { sopCan } from "@/lib/sop-roles";
import { canViewCompliance } from "@/lib/products/playbook-ai/access";
import { EXPORT_TYPES, buildExport, type ExportType } from "@/lib/products/playbook-ai/exports";
import { buildWorkbook } from "@/lib/products/playbook-ai/xlsx";
import { recordAudit } from "@/lib/products/playbook-ai/audit";
import { toCsv } from "@/lib/csv";

type Context = { params: Promise<{ type: string }> };

/** Spreadsheet apps execute cells beginning with = + - @ as formulas; prefix them so exported text stays text. */
function csvSafe(v: unknown): unknown {
  return typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

async function handleGET(req: NextRequest, { params }: Context) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type } = await params;
  if (!(EXPORT_TYPES as readonly string[]).includes(type)) return NextResponse.json({ error: "Unknown export." }, { status: 404 });
  const kind = type as ExportType;
  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };

  // Capability first; the datasets themselves are then built from the viewer's own permission-filtered data.
  const allowed =
    kind === "audit" ? sopCan(ctx, "VIEW_AUDIT") : kind === "compliance" || kind === "acknowledgements" ? sopCan(ctx, "EXPORT") && canViewCompliance(viewer) : sopCan(ctx, "EXPORT");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const format = (req.nextUrl.searchParams.get("format") ?? "csv").toLowerCase();
  if (format !== "csv" && format !== "xlsx") return NextResponse.json({ error: "format must be csv or xlsx." }, { status: 400 });

  const sp: Record<string, string | undefined> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    sp[key] = value;
  });
  const set = await buildExport(viewer, kind, sp);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `sop-${kind}-${stamp}`;

  await recordAudit({
    actorId: viewer.userId,
    actorEmail: viewer.email,
    action: "export",
    entity: "export",
    entityId: kind,
    entityLabel: set.title,
    summary: `Exported ${set.rows.length} row(s) as ${format.toUpperCase()}`,
  });

  const headers = { "Cache-Control": "private, no-store" };
  if (format === "csv") {
    const csv = toCsv(set.rows, set.columns.map((c) => ({ header: c.header, value: (r: Record<string, unknown>) => csvSafe(r[c.key]) })));
    return new NextResponse(`﻿${csv}`, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
  }
  const safeRows = set.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, csvSafe(v)])));
  const buf = await buildWorkbook(set.title, set.columns, safeRows);
  return new NextResponse(new Uint8Array(buf), {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"` },
  });
}

export const GET = withTransport(handleGET);
