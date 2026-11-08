import { NextResponse, type NextRequest } from "next/server";
import { legacyTarget } from "@/lib/products/viralpulse-ai/nav";

/** The AI Content Generator is now the copy generator of Social Media Reels/Posts. Old links keep working (HTTP 308, query kept). */
export function GET(req: NextRequest) {
  const to = legacyTarget("/viralpulse-ai/ai", req.nextUrl.searchParams) ?? "/viralpulse-ai/posts/generator";
  return NextResponse.redirect(new URL(to, req.url), 308);
}
