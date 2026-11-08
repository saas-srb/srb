import { NextRequest, NextResponse } from "next/server";
import { listStaffOptions, searchTargets } from "@/lib/dealflow-ai/meetings/service";
import { requireLms } from "@/lib/lms-auth";

import { withTransport } from "@/lib/security/transport";
/** GET /api/dealflow-ai/meetings/directory?kind=staff|targets&q= — people and records the scheduler can pick. */
async function handleGET(req: NextRequest) {
  if (!(await requireLms("VIEW_LEADS"))) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").slice(0, 60);
  if (sp.get("kind") === "targets") return NextResponse.json({ ok: true, targets: await searchTargets(q) });
  return NextResponse.json({ ok: true, staff: await listStaffOptions(q, 50) });
}

export const GET = withTransport(handleGET);
