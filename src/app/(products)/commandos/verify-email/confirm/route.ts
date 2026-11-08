import { NextRequest, NextResponse } from "next/server";
import { consumeVerification } from "@/lib/platform/email-verification";
import { isSameOriginPost } from "@/lib/platform/email-verification-rule";
import { requestOrigin } from "@/lib/platform/request";

/**
 * The "Verify my email" form posts here: a plain browser navigation (no client router, no server action), so the
 * browser always ends on the page we redirect to. POST only — a GET (mail scanners pre-fetching) never consumes.
 * Works signed in or out; only the token's own user is affected, and only on the company the host belongs to.
 */
export async function POST(req: NextRequest) {
  const { origin, host } = await requestOrigin();
  if (!isSameOriginPost({ secFetchSite: req.headers.get("sec-fetch-site"), origin: req.headers.get("origin"), host })) {
    return new NextResponse("Cross-site request refused.", { status: 403 });
  }
  const token = String((await req.formData().catch(() => null))?.get("token") ?? "");
  const result = token ? await consumeVerification(token) : { ok: false as const };
  const to = result.ok ? "/commandos?emailVerified=1" : `/commandos/verify-email?token=${encodeURIComponent(token)}&error=expired`;
  return NextResponse.redirect(new URL(to, origin), 303);
}
