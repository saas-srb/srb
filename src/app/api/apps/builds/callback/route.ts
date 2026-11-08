import { NextResponse } from "next/server";
import { hasBearer } from "@/lib/security/bearer";
import { applyBuildReport, type BuildReport } from "@/lib/apps/callback";

/**
 * The build service (the GitHub Actions workflow) reports progress and the finished installers here:
 * `Authorization: Bearer $DESKTOP_BUILD_SECRET`. Nothing is accepted without that secret.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!hasBearer(req, process.env.DESKTOP_BUILD_SECRET?.trim())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as BuildReport | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const res = await applyBuildReport(body);
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: res.error }, { status: res.status });
}
