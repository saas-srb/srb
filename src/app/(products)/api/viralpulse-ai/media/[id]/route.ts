import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { getMedia, keyBelongsToCompany } from "@/lib/products/viralpulse-ai/media";
import { getObject } from "@/lib/storage/blob";

type Context = { params: Promise<{ id: string }> };

/**
 * Authenticated media streamer — the only way a browser reaches a library file
 * (the Blob store is private). Anyone who can use the library, posts, ads or campaigns may view media; the
 * response can never execute script. `?download=1` forces a download.
 */
async function handleGET(req: NextRequest, { params }: Context) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // The same rule as the pages that show media: the library, posts, ads or the campaigns that use it. A signed-in person with none of these gets nothing.
  if (!(can(viewer, "MANAGE_MEDIA") || can(viewer, "MANAGE_POSTS") || can(viewer, "CREATE_ADS") || can(viewer, "VIEW_CAMPAIGNS"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const media = await getMedia(id);
  if (!media || !(await keyBelongsToCompany(media.storageKey))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const wantThumb = req.nextUrl.searchParams.get("thumb") === "1" && !!media.thumbKey;
  const object = await getObject(wantThumb ? media.thumbKey! : media.storageKey).catch(() => null);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const type = wantThumb ? "image/webp" : media.contentType;
  const ext = type.split("/")[1] ?? "bin";
  const filename = `${media.name.replace(/[^\w .-]+/g, "").trim() || "media"}.${ext}`;
  return new NextResponse(object.stream, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

export const GET = withTransport(handleGET);
