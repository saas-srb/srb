import { NextResponse } from "next/server";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { isImportType, sampleCsv } from "@/lib/platform/import/shared";

/** GET /commandos/settings/import/sample?type=leads — a small example file with the right headers. */
export async function GET(req: Request) {
  const user = await getCurrentHubUser();
  if (!user || !user.roles.includes("super_admin")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const type = new URL(req.url).searchParams.get("type");
  if (!isImportType(type)) return NextResponse.json({ error: "Unknown type." }, { status: 400 });
  return new NextResponse(sampleCsv(type), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${type}-sample.csv"`, "cache-control": "no-store" } });
}
