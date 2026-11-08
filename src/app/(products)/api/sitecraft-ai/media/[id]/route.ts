import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getMedia } from "@/lib/products/sitecraft-ai/media";
import { getObject } from "@/lib/storage/blob";

type Context = { params: Promise<{ id: string }> };

/**
 * Public, unauthenticated read route for CMS media — deliberately different
 * from SMMS's signed/short-lived `/api/viralpulse-ai/media/public/[id]` (media there
 * is a one-time external-platform fetch at publish time). CMS media is
 * embedded permanently in public page HTML, so this URL is stable and
 * publicly cacheable, with no session or signature required — nothing served
 * here is sensitive, it's marketing image content by definition. Upload and
 * delete still require a CMS session (see `/api/sitecraft-ai/media/upload`).
 */
async function handleGET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const media = await getMedia(id);
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const object = await getObject(media.storageKey).catch(() => null);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(object.stream, {
    headers: {
      "Content-Type": media.contentType,
      ...(media.size ? { "Content-Length": String(media.size) } : {}),
      "X-Content-Type-Options": "nosniff",
      // An uploaded SVG can carry script: as an <img> it is inert, and opened directly this policy sandboxes it.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

export const GET = withTransport(handleGET);
