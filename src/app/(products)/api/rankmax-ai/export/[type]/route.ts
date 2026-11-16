import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { EXPORT_TYPES, buildExport, type ExportType } from "@/lib/products/rankmax-ai/exports";
import { buildWorkbook } from "@/lib/products/rankmax-ai/xlsx";
import { recordAudit } from "@/lib/products/rankmax-ai/audit";
import { toCsv } from "@/lib/csv";

/** What each export shows, as the view feature that must also be held. */
const VIEW_OF: Record<Exclude<ExportType, "audit">, string> = { technical: "technical.view", on_page: "onpage.view", keywords: "keywords.view", rankings: "rankings.view", backlinks: "backlinks.view", competitors: "competitors.view", sitemap: "sitemap.view", indexing: "technical.view", issues: "issues.view", health: "audit.view", pages: "pages.view", tasks: "tasks.view" };

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
  // An export needs the export feature AND the view feature of what it exports (the activity log needs only its own feature).
  if (!(kind === "audit" ? can(viewer, "audit.log") : can(viewer, "reports.export") && can(viewer, VIEW_OF[kind]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const format = (req.nextUrl.searchParams.get("format") ?? "csv").toLowerCase();
  if (format !== "csv" && format !== "xlsx") return NextResponse.json({ error: "format must be csv or xlsx." }, { status: 400 });
  const sp: Record<string, string | undefined> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    sp[key] = value;
  });
  const set = await buildExport(viewer, kind, sp);
  const base = `seo-${kind}-${new Date().toISOString().slice(0, 10)}`;

  await recordAudit({ actorId: viewer.userId, actorEmail: viewer.email, action: "export", entity: "export", entityId: kind, entityLabel: set.title, summary: `Exported ${set.rows.length} row(s) as ${format.toUpperCase()}` });

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
