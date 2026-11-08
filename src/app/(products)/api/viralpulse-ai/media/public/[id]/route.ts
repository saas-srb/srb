import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { verifyMediaToken } from "@/lib/products/viralpulse-ai/crypto";
import { getMedia, keyBelongsToCompany } from "@/lib/products/viralpulse-ai/media";
import { getObject } from "@/lib/storage/blob";
import { imageBytesFor } from "@/lib/products/viralpulse-ai/publishers/media-facts";

type Context = { params: Promise<{ id: string }> };

/**
 * Signed, one-hour media URL for platforms that fetch media by URL while a
 * post is being published (Instagram, Facebook, Google Business Profile).
 * No session — the HMAC signature over id + expiry is the only credential,
 * minted by `publicMediaUrl` at publish time.
 */
async function handleGET(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!verifyMediaToken(id, exp, sig)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const media = await getMedia(id);
  if (!media || !(await keyBelongsToCompany(media.storageKey))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // `fmt=jpeg`: a JPEG rendition for Instagram (JPEG is the only image format it accepts). Images only; bounded size.
  if (req.nextUrl.searchParams.get("fmt") === "jpeg" && media.kind === "image" && media.contentType !== "image/jpeg") {
    const out = await imageBytesFor(id, { jpeg: true }).catch(() => null);
    if (!out) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(out.bytes), { headers: { "Content-Type": "image/jpeg", "Content-Length": String(out.bytes.length), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
  }
  const object = await getObject(media.storageKey).catch(() => null);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(object.stream, {
    headers: {
      "Content-Type": media.contentType,
      ...(media.size ? { "Content-Length": String(media.size) } : {}),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export const GET = withTransport(handleGET);
