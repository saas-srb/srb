import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { PDF_BY_KEY } from "@/lib/pdf/catalog";
import { renderSamplePdf } from "@/lib/pdf/samples";

type Context = { params: Promise<{ key: string }> };

/** A sample PDF for the Platform Console's Documents & PDFs page, in the platform operator's letterhead, with made-up figures. */
async function handleGET(req: NextRequest, { params }: Context) {
  const auth = await checkPlatformPermission("settings.read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });
  const { key } = await params;
  if (!PDF_BY_KEY.has(key)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let buffer: Buffer | null;
  try {
    buffer = await renderSamplePdf(key, req.nextUrl.searchParams.get("variant"));
  } catch (err) {
    console.error(`[pdf-library] console sample ${key} failed`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The sample could not be made right now." }, { status: 500 });
  }
  if (!buffer) return NextResponse.json({ error: "This document has no server-made sample." }, { status: 404 });
  const download = req.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="sample-${key}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export const GET = withTransport(handleGET);
