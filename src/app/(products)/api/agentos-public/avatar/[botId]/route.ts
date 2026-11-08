import { NextRequest, NextResponse } from "next/server";
import { readPublicAvatar } from "@/lib/products/agentos/calls/public";

type Ctx = { params: Promise<{ botId: string }> };

/** The photo of a PUBLIC agent, for the website directory. 404 for any other agent (it never says whether one exists). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { botId } = await params;
  const photo = await readPublicAvatar(botId).catch(() => null);
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(photo.body), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" },
  });
}
