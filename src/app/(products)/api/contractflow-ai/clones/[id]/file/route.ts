import { NextRequest, NextResponse } from "next/server";
import { withTransport } from "@/lib/security/transport";
import { renderClone } from "@/lib/products/contractflow-ai/clone-render";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";

/** Download of a clone as PDF or Word (`?format=pdf|docx`). Session required; the data layer checks the DOWNLOAD permission and party access. */
async function handleGET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") === "docx" ? "docx" : "pdf";
  const r = await renderClone(viewer, id, format);
  if (!r.ok) {
    const status = r.error.code === "forbidden" ? 403 : r.error.code === "not_found" ? 404 : 422;
    return NextResponse.json({ error: r.error.message }, { status });
  }
  return new NextResponse(new Uint8Array(r.file.buffer), {
    headers: {
      "Content-Type": r.file.mimeType,
      "Content-Disposition": `attachment; filename="${r.file.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GET = withTransport(handleGET);
