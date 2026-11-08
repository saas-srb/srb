import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { PDF_BY_KEY } from "@/lib/pdf/catalog";
import { getFeatureControls, pdfOff } from "@/lib/platform/feature-controls";
import { renderSamplePdf } from "@/lib/pdf/samples";

type Context = { params: Promise<{ key: string }> };

/**
 * A sample of one of the system's PDFs, in the signed-in company's own letterhead (Settings → Documents & PDFs). Made with made-up
 * figures and names: no real record is read, so it is safe to show anywhere. Directors only.
 */
async function handleGET(req: NextRequest, { params }: Context) {
  const auth = await authorizeWorkspaceApi("company.pdfs");
  if (!auth.ok) return auth.response;
  const { key } = await params;
  const type = PDF_BY_KEY.get(key);
  if (!type) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const controls = await getFeatureControls();
  if (!controls.pdfLibrary || pdfOff(controls, key)) return NextResponse.json({ error: "This document is turned off by the platform." }, { status: 403 });
  let buffer: Buffer | null;
  try {
    buffer = await renderSamplePdf(key, req.nextUrl.searchParams.get("variant"));
  } catch (err) {
    console.error(`[pdf-library] sample ${key} failed`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The sample could not be made right now." }, { status: 500 });
  }
  if (!buffer) return NextResponse.json({ error: "This document has no server-made sample." }, { status: 404 });
  const download = req.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="sample-${key}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GET = withTransport(handleGET);
