import { NextResponse } from "next/server";
import { withTransport } from "@/lib/security/transport";
import { limitOr429 } from "@/lib/security/rate-limit";
import { readSafeJson, UnsafeBodyError } from "@/lib/security/safe-json";
import { OtpError } from "@/lib/products/contractflow-ai/otp";
import { checkCodeForToken, sendCodeForToken } from "@/lib/products/contractflow-ai/otp-public";
import { REFUSAL_COPY, resolveSignerToken } from "@/lib/products/contractflow-ai/public-access";
import { submitDecline, submitSignature, type SubmitInput } from "@/lib/products/contractflow-ai/sign-flow";

/**
 * The signer's actions, called from the public signing page. No session: the link's token is the only credential, and it is looked up (hashed)
 * on every call. Browser origin and the front door's rate limits apply, plus the limits below and those inside each step. Answers are plain
 * JSON with a message a person can read; nothing says which part of a guessed token was close.
 *   POST .../otp-send {channel}   .../otp-check {code}   .../sign {…}   .../decline {reason}
 */
const STATUS = { rate_limited: 429, not_found: 404, unavailable: 404, revoked: 410, used: 410, voided: 410, expired: 410 } as const;
const MAX_BODY = 2_300_000;

async function handlePOST(req: Request, { params }: { params: Promise<{ token: string; action: string }> }) {
  const limited = await limitOr429(req, "cf-sign-act", 60, 600);
  if (limited) return limited;
  const { token, action } = await params;
  let body: Record<string, unknown>;
  try {
    body = await readSafeJson(req, MAX_BODY);
  } catch (err) {
    if (err instanceof UnsafeBodyError) return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    throw err;
  }
  const headers = req.headers;
  const refused = (reason: keyof typeof REFUSAL_COPY) => NextResponse.json({ ok: false, reason, error: REFUSAL_COPY[reason].body, title: REFUSAL_COPY[reason].title }, { status: STATUS[reason] });
  try {
    if (action === "otp-send") {
      const r = await sendCodeForToken(token, body.channel === "sms" ? "sms" : "email", headers);
      return r.ok ? NextResponse.json({ ok: true, destination: r.value.destinationMasked, expiresAt: r.value.expiresAt.toISOString(), resendAfterSeconds: r.value.resendAfterSeconds }) : refused(r.reason);
    }
    if (action === "otp-check") {
      const r = await checkCodeForToken(token, body.code, headers);
      return r.ok ? NextResponse.json({ ok: true, verifiedUntil: r.value.verifiedUntil.toISOString() }) : refused(r.reason);
    }
    if (action === "sign" || action === "decline") {
      const access = await resolveSignerToken(token, headers);
      if (!access.ok) return refused(access.reason);
      const r = action === "sign" ? await submitSignature(access, body as unknown as SubmitInput, headers) : await submitDecline(access, body.reason, headers);
      if (r.ok) return NextResponse.json({ ok: true, complete: "complete" in r ? r.complete : undefined });
      return NextResponse.json({ ok: false, code: r.code, error: r.message }, { status: r.code === "closed" || r.code === "already_done" ? 409 : 422 });
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 404 });
  } catch (err) {
    if (err instanceof OtpError) {
      const res = NextResponse.json({ ok: false, code: err.code, error: err.message, attemptsLeft: err.attemptsLeft, retryAfterSeconds: err.retryAfterSeconds }, { status: err.code === "rate_limited" ? 429 : err.code === "send_failed" ? 502 : 422 });
      if (err.retryAfterSeconds) res.headers.set("Retry-After", String(err.retryAfterSeconds));
      return res;
    }
    console.error("[contractflow-sign] unexpected failure", action, err instanceof Error ? err.name : "error");
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
