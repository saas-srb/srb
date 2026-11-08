import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { getReadableSop } from "@/lib/products/playbook-ai/sops";
import { canDownloadSop, toAccessDoc } from "@/lib/products/playbook-ai/access";
import { getSopFile, readSopFile } from "@/lib/products/playbook-ai/files";
import { recordAuditThrottled } from "@/lib/products/playbook-ai/audit";
import { todayIso } from "@/lib/products/playbook-ai/db";

type Context = { params: Promise<{ id: string }> };

const SAFE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  // Uploaded content can never run script or load anything if it is somehow opened directly.
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "Cache-Control": "private, no-store",
};

/**
 * Authenticated file streamer. Every request re-checks that the viewer may
 * read the owning SOP — a leaked file URL is useless to anyone without access.
 * Embedded images/videos need only read access; documents and `?download=1`
 * additionally need DOWNLOAD permission on an SOP that allows it, and are
 * written to the audit trail.
 */
async function handleGET(req: NextRequest, { params }: Context) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const file = await getSopFile(id);
  // Same 404 whether the file doesn't exist or the SOP isn't readable, so existence isn't revealed.
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const found = await getReadableSop(viewer, file.sopId);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wantsDownload = req.nextUrl.searchParams.get("download") === "1" || file.kind === "document";
  if (wantsDownload) {
    if (!canDownloadSop(viewer, toAccessDoc(found.doc, todayIso()), found.assigned)) {
      return NextResponse.json({ error: "Downloads are not allowed for this SOP." }, { status: 403 });
    }
    await recordAuditThrottled(
      {
        actorId: viewer.userId,
        actorEmail: viewer.email,
        action: "download",
        entity: "file",
        entityId: file._id,
        sopId: file.sopId,
        entityLabel: `${found.doc.code} · ${file.filename}`,
        summary: `Downloaded "${file.filename}"`,
      },
      60_000
    );
  }

  const object = await readSopFile(file);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const disposition = wantsDownload ? "attachment" : "inline";
  const headers: Record<string, string> = {
    ...SAFE_HEADERS,
    "Content-Type": file.contentType,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
  };

  // Video needs byte-range support (Safari refuses to play without it). Files are capped at 25 MB, so buffering is fine.
  if (file.kind === "video") {
    const buf = Buffer.from(await new Response(object.stream).arrayBuffer());
    const total = buf.byteLength;
    headers["Accept-Ranges"] = "bytes";
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : total - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : total - 1;
      start = Math.max(start, 0);
      end = Math.min(end, total - 1);
      if (start > end || start >= total) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
      headers["Content-Range"] = `bytes ${start}-${end}/${total}`;
      headers["Content-Length"] = String(end - start + 1);
      return new NextResponse(new Uint8Array(buf.subarray(start, end + 1)), { status: 206, headers });
    }
    headers["Content-Length"] = String(total);
    return new NextResponse(new Uint8Array(buf), { headers });
  }

  return new NextResponse(object.stream, { headers });
}

export const GET = withTransport(handleGET);
