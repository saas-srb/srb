import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { getProject } from "@/lib/products/viralpulse-ai/images/store";
import { getObject } from "@/lib/storage/blob";

type Context = { params: Promise<{ projectId: string; variantId: string }> };

/** Streams one generated (not yet saved) picture of an Image Studio project to a signed-in person who may use the studio. */
async function handleGET(_req: NextRequest, { params }: Context) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // The Create tab that shows these pictures needs both; so does this route.
  if (!can(viewer, "MANAGE_MEDIA") || !can(viewer, "GENERATE_AI_CONTENT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId, variantId } = await params;
  const project = await getProject(projectId);
  const variant = project?.variants.find((v) => v.id === variantId);
  if (!variant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const object = await getObject(variant.storageKey).catch(() => null);
  if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(object.stream, {
    headers: { "Content-Type": "image/png", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}

export const GET = withTransport(handleGET);
