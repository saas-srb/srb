import { NextResponse, type NextRequest } from "next/server";
import { legacyTarget } from "@/lib/products/viralpulse-ai/nav";

/** The Media Library is its own sidebar item at /viralpulse-ai/library. Old links, bookmarks and notifications keep working (HTTP 308, query kept). */
export function GET(req: NextRequest) {
  const to = legacyTarget("/viralpulse-ai/media", req.nextUrl.searchParams) ?? "/viralpulse-ai/library";
  return NextResponse.redirect(new URL(to, req.url), 308);
}
