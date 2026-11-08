import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { UPLOAD_PATH, assertUploadOwner } from "@/lib/products/viralpulse-ai/media";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, VIDEO_TYPES } from "@/lib/products/viralpulse-ai/constants";
import { blobAuth } from "@/lib/storage/blob-token";

/**
 * Issues a short-lived Vercel Blob client-upload token so the BROWSER uploads
 * straight to the (private) Blob store — videos are far larger than the 4.5 MB
 * a function can receive. The token is only issued to a signed-in SMMS user
 * with MANAGE_MEDIA, for a server-shaped pathname, allowed media types and a
 * size cap. The browser then calls `registerMediaAction`, which re-reads the
 * blob's real type and size before adding it to the library.
 */
async function handlePOST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Your session has expired — please sign in again." }, { status: 401 });
  if (!can(viewer, "MANAGE_MEDIA")) return NextResponse.json({ error: "You don't have permission to upload media." }, { status: 403 });

  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  // Completion callbacks from Blob aren't used — registration is an explicit, authenticated step.
  if (body.type !== "blob.generate-client-token") return NextResponse.json({ error: "Bad request." }, { status: 400 });

  try {
    const json = await handleUpload({
      ...(await blobAuth()),
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!UPLOAD_PATH.test(pathname)) throw new Error("Invalid upload path.");
        await assertUploadOwner(pathname);
        const isVideo = /\.(mp4|mov|webm)$/.test(pathname);
        return {
          allowedContentTypes: Object.keys(isVideo ? VIDEO_TYPES : IMAGE_TYPES),
          maximumSizeInBytes: isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 30 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message.slice(0, 200) }, { status: 400 });
  }
}

export const POST = withTransport(handlePOST);
