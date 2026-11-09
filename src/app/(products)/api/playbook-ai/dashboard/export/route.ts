import { NextRequest, NextResponse } from "next/server";
import { withTransport } from "@/lib/security/transport";
import { userRateLimit } from "@/lib/security/rate-limit";
import { getPbActor } from "@/lib/products/playbook-ai/pb-actor";
import { parsePbFilters } from "@/lib/products/playbook-ai/dashboard/filters";
import { loadDashboard } from "@/lib/products/playbook-ai/dashboard/fetch";
import { resolveRange } from "@/lib/products/playbook-ai/dashboard/ranges";
import { dashboardCsv } from "@/lib/products/playbook-ai/dashboard/csv";

/** GET /api/playbook-ai/dashboard/export?range=7|30|90|fy|custom&from=&to= : the dashboard figures for the same range and the same permission scope as the page, as CSV. */
const json = (status: number, code: string, message: string) => NextResponse.json({ ok: false, error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });

async function handleGET(req: NextRequest) {
  const actor = await getPbActor();
  if (!actor) return json(401, "unauthorized", "Sign in to export the dashboard.");
  const limited = await userRateLimit("pb-dashboard-export", actor.id, 20, 60);
  if (!limited.ok) return json(429, "rate_limited", "Too many exports. Wait a moment and try again.");
  const q = req.nextUrl.searchParams;
  const range = resolveRange(q.get("range") ?? undefined, Date.now(), { from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });
  const data = await loadDashboard(actor, range, parsePbFilters(Object.fromEntries(q.entries())));
  if (!data) return json(403, "forbidden", "You are not allowed to see the dashboard.");
  const day = new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
  return new NextResponse(`﻿${dashboardCsv(data)}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="playbook-dashboard-${day}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export const GET = withTransport(handleGET);
