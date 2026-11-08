import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getViewer, can, SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import { isConnectionProvider, CONNECTION_INFO } from "@/lib/products/viralpulse-ai/accounts/types";
import { discardConnectState, finishConnect } from "@/lib/products/viralpulse-ai/accounts/service";

type Context = { params: Promise<{ provider: string }> };

const NONCE_COOKIE = "smms_oauth_n";
const BACK = "/viralpulse-ai/settings/accounts";

/** Plain words for what the platforms send back when the person says no. */
function denial(code: string, description: string): string {
  if (/access_denied|user_denied|user_cancelled/i.test(code) || /denied|cancel/i.test(description)) return "You cancelled the sign-in or didn't allow access, so nothing was connected.";
  return `The platform didn't grant access (${(description || code).slice(0, 150)}).`;
}

/**
 * OAuth redirect target (a browser navigation). Needs the signed-in person's session, the cookie nonce and the single-use state started
 * by the person who is finishing it; then it exchanges the code, checks the token with the platform, discovers the accounts and stores
 * everything encrypted. Every failure lands on the accounts page with a plain message; no token or code is ever put in the address.
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

  const store = await cookies();
  const nonce = store.get(NONCE_COOKIE)?.value ?? "";
  store.delete(NONCE_COOKIE);
  const q = req.nextUrl.searchParams;
  const state = q.get("state") ?? "";
  // The state is consumed even when the platform reports a refusal, so a refused attempt cannot be replayed later.
  const denied = q.get("error");
  const code = q.get("code");
  if (!state || !nonce) return fail("The connection request expired or didn't come from this browser. Please start again.");
  if (denied) {
    await discardConnectState(state);
    return fail(denial(denied, q.get("error_description") ?? q.get("error_reason") ?? ""));
  }
  if (!code) return fail("No authorization code was returned.");
  try {
    const r = await finishConnect({ oauth: provider, state, nonce, code, actor: { userId: viewer.userId, email: viewer.email } });
    back.searchParams.set("connected", CONNECTION_INFO[provider].short);
    back.searchParams.set("found", String(r.accounts));
    if (r.missing.length) back.searchParams.set("missing", r.missing.join(",").slice(0, 300));
    if (r.notes.length) back.searchParams.set("note", r.notes[0].slice(0, 300));
    return NextResponse.redirect(back);
  } catch (err) {
    return fail(err instanceof SmmsInputError ? err.message : `Connecting ${CONNECTION_INFO[provider].short} failed. Please try again; if it keeps failing check the app credentials and redirect URL.`);
  }
}
