import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { isValidImportKind, isValidPlatform } from "@/lib/campaign-platforms";
import { templateHeadersFor } from "@/lib/campaign-csv";

async function handleGET(req: NextRequest) {
  const lmsUser = await requireLms("MANAGE_CAMPAIGNS");
  if (!lmsUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const platform = sp.get("platform") ?? "";
  const kind = sp.get("kind") ?? "";
  if (!isValidPlatform(platform) || !isValidImportKind(kind)) {
    return NextResponse.json({ error: "Unknown platform or type." }, { status: 400 });
  }

  const headers = templateHeadersFor(platform, kind);
  const csv = headers.join(",") + "\r\n";
  const filename = `${platform}-${kind}-template.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
