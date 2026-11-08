import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { peopleUsageCsv, usageEventsCsv } from "@/lib/platform/billing/usage-history";
import { isUsageMetricKey } from "@/lib/platform/billing/usage-history-shared";

export const dynamic = "force-dynamic";

/** GET /api/commandos/usage/export?metric=ai|storage|emails|voice|seats|domains&period=YYYY-MM — the itemised history as CSV. */
async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("company.usage");
  if (!auth.ok) return auth.response;
  const metric = req.nextUrl.searchParams.get("metric");
  const wanted = req.nextUrl.searchParams.get("period");
  const period0 = wanted && /^\d{4}-\d{2}$/.test(wanted) ? wanted : undefined;
  if (metric === "people") {
    const { filename, csv } = await peopleUsageCsv(period0);
    return new NextResponse(`\uFEFF${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
  }
  if (!isUsageMetricKey(metric)) return NextResponse.json({ error: "Unknown meter." }, { status: 400 });
  const period = req.nextUrl.searchParams.get("period") ?? undefined;
  const { filename, csv } = await usageEventsCsv(metric, period && /^\d{4}-\d{2}$/.test(period) ? period : undefined);
  return new NextResponse(`﻿${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
}

export const GET = withTransport(handleGET);
