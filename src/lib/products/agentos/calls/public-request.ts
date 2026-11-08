import "server-only";
import { logText } from "@/lib/products/agentos/calls/phone";
import { clientIpFrom } from "@/lib/security/ip";
import { NextResponse } from "next/server";
import { PublicCallError } from "@/lib/products/agentos/calls/public";
import { parseOrigin } from "@/lib/products/agentos/calls/public-security";

/** What the public routes read from a request. The company is NOT here: it always comes from the Host (tenant context), never from the caller. */
export function publicRequestContext(req: Request): { ip: string; ownOrigin: string; requestOrigin: string | null } {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || new URL(req.url).protocol.replace(":", "");
  const ownOrigin = parseOrigin(`${proto === "http" || proto === "https" ? proto : "https"}://${host}`);
  if (!ownOrigin) throw new PublicCallError("Not found", "unavailable", 404);
  // A call to these routes comes from the company's own directory page. A browser that is on another website sends its own Origin, which is refused
  // here as well as at the front door; no CORS header is ever sent, so another website cannot read a response either.
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== ownOrigin) throw new PublicCallError("Forbidden", "unavailable", 403);
  // `requestOrigin` is what the browser said (null = no Origin header). Session POSTs use it: an agent limited to listed websites is not started by a
  // request that carries no Origin (see startPublicSession).
  return { ip: clientIpFrom(req.headers), ownOrigin, requestOrigin: origin === null ? null : parseOrigin(origin) };
}

/** The JSON answer for a visitor-facing failure (the message is already safe to show). Never cached. */
export function publicErrorResponse(e: unknown): NextResponse {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (e instanceof PublicCallError) {
    if (e.retryAfter) headers["Retry-After"] = String(e.retryAfter);
    return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status: e.status, headers });
  }
  console.error("[agentos public] unexpected", logText(e));
  return NextResponse.json({ ok: false, error: "Something went wrong. Please try again.", code: "provider" }, { status: 500, headers });
}

export const publicJson = (body: Record<string, unknown>) => NextResponse.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store" } });
