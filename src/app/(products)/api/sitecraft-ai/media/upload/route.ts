import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { UPLOAD_PATH, IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/products/sitecraft-ai/media";
import { blobAuth } from "@/lib/storage/blob-token";

/**
 * Issues a short-lived Vercel Blob client-upload token so the browser
 * uploads straight to the (private) Blob store — same pattern as
 * `/api/viralpulse-ai/media/upload`. The browser then calls `registerCmsMediaAction`,
 * which re-reads the blob's real type and size before trusting it.
 */
async function handlePOST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Your session has expired — please sign in again." }, { status: 401 });
  if (!can(viewer, "MEDIA_UPLOAD")) return NextResponse.json({ error: "You don't have permission to upload media." }, { status: 403 });

  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (body.type !== "blob.generate-client-token") return NextResponse.json({ error: "Bad request." }, { status: 400 });

  try {
    const json = await handleUpload({
      ...(await blobAuth()),
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!UPLOAD_PATH.test(pathname)) throw new Error("Invalid upload path.");
        return {
          allowedContentTypes: Object.keys(IMAGE_TYPES),
          maximumSizeInBytes: MAX_IMAGE_BYTES,
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
