import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getViewer, can, canReadScope } from "@/lib/products/cybervault/viewer";
import { getDocumentDoc } from "@/lib/products/cybervault/records";
import { readDlmsFile } from "@/lib/products/cybervault/files";
import { recordAuditThrottled } from "@/lib/products/cybervault/audit";

type Context = { params: Promise<{ id: string }> };

/**
 * Authenticated file streamer — the ONLY way to reach a stored document (the
 * blob store is private, there is no public URL). Every request re-checks the
 * DLMS session, the DOWNLOAD permission and that the viewer may see the
 * document's company/client scope. Previews and downloads are both logged.
 * Query: `?v=<version>` (default: current), `&download=1` for a forced download.
 */
async function handleGET(req: NextRequest, { params }: Context) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(viewer, "DOWNLOAD")) return NextResponse.json({ error: "You don't have permission to open documents." }, { status: 403 });

  const { id } = await params;
  const doc = await getDocumentDoc(viewer, id);
  // Same 404 whether it doesn't exist or is out of scope, so existence isn't revealed.
  if (!doc || !canReadScope(viewer, doc.scope, doc.clientId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wanted = Number(req.nextUrl.searchParams.get("v")) || doc.currentVersion;
  const version = doc.versions.find((v) => v.version === wanted);
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const download = req.nextUrl.searchParams.get("download") === "1";
  // Only images and PDFs are ever rendered inline; everything else is forced to download.
  const inline = !download && (version.kind === "image" || version.kind === "pdf");

  await recordAuditThrottled(
    {
      actorId: viewer.userId,
      actorEmail: viewer.email,
      action: inline ? "view" : "download",
      entity: "document",
      entityId: doc._id,
      entityLabel: doc.name,
      scope: doc.scope,
      clientId: doc.clientId,
      summary: `${inline ? "Previewed" : "Downloaded"} "${doc.name}" v${version.version}`,
    },
    inline ? 60_000 : 10_000
  );

  const object = await readDlmsFile(version.storageKey);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": version.contentType,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(version.filename)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    // A stored file can never run script or load anything if it is somehow opened directly. (PDFs are exempt from
    // `sandbox`, which blocks the browser's built-in PDF viewer; `default-src 'none'` still blocks everything else.)
    "Content-Security-Policy": version.kind === "pdf" ? "default-src 'none'; style-src 'unsafe-inline'; object-src 'self'" : "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
  return new NextResponse(object.stream, { headers });
}

export const GET = withTransport(handleGET);
