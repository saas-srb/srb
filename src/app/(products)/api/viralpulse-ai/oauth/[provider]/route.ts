import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getViewer, can, SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import { isConnectionProvider } from "@/lib/products/viralpulse-ai/accounts/types";
import { startConnect } from "@/lib/products/viralpulse-ai/accounts/service";
import { originFromHeaders } from "@/lib/products/viralpulse-ai/oauth-redirect";

type Context = { params: Promise<{ provider: string }> };

export const OAUTH_NONCE_COOKIE = "smms_oauth_n";
const BACK = "/viralpulse-ai/settings/accounts";

/**
 * Starts connecting a platform login (MANAGE_INTEGRATIONS only). This is a browser navigation, not a JSON call, so it redirects.
 * Query: `features` (comma list of what to ask for), `reconnect` (the login id to renew), `fix` (extra scopes to request).
 * The single-use `state` is stored on the server with the person's id and PKCE verifier; the browser only gets a random nonce in an
 * httpOnly cookie, which the callback must present too, so a callback cannot be completed from another browser or replayed.
 */
export async function GET(req: NextRequest, { params }: Context) {
  const back = new URL(BACK, req.url);
  const fail = (msg: string) => {
    back.searchParams.set("error", msg);
    return NextResponse.redirect(back);
  };
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL("/viralpulse-ai/login", req.url));
  if (!can(viewer, "MANAGE_INTEGRATIONS")) return NextResponse.redirect(new URL("/viralpulse-ai", req.url));
  const { provider } = await params;
  if (!isConnectionProvider(provider)) return fail("Unknown platform.");
  const q = req.nextUrl.searchParams;
  const list = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter((s) => /^[\w.:/-]{1,120}$/.test(s)).slice(0, 20) : []);
  try {
    const origin = originFromHeaders(req.headers, new URL(req.url).origin) ?? new URL(req.url).origin;
    const started = await startConnect({ oauth: provider, userId: viewer.userId, origin, features: list(q.get("features")), connectionId: q.get("reconnect") || null, extraScopes: list(q.get("fix")) });
    (await cookies()).set(OAUTH_NONCE_COOKIE, started.nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/viralpulse-ai/oauth", maxAge: 600 });
    const res = NextResponse.redirect(started.url);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    return fail(err instanceof SmmsInputError ? err.message : "Couldn't start the connection. Please try again.");
  }
}
