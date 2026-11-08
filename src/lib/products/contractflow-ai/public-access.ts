import "server-only";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { cfRequests, cfSigners, cfSignersAcrossCompanies } from "./cf-db";
import { appendEvent } from "./events";
import { OTP_VERIFIED_MINUTES } from "./otp";
import { expireIfDue } from "./requests";
import { hashToken, isWellFormedToken } from "./tokens";
import type { RequestDoc, SignerDoc } from "./sign-types";

/**
 * How a signer's link is turned into a request, for the PUBLIC pages (`/sign/<token>`). The signer is not signed in and the host of the
 * address bar means nothing: the company is taken from the signer row the token points to, and every later read runs inside that company.
 * A token for company A can therefore never open anything of company B, whichever host it is used on, and a host cannot widen it.
 */

export type RefusalReason = "rate_limited" | "not_found" | "revoked" | "used" | "voided" | "expired" | "unavailable";

export interface SignerAccess {
  ok: true;
  companyId: string;
  request: RequestDoc;
  signer: Omit<SignerDoc, "tokenHash">;
  /** True when the holder of the link passed the one-time-code check recently enough to sign (B3). The signing step must require it. */
  identityVerified: boolean;
  /** Run company-scoped code for the company the REQUEST belongs to. */
  inCompany: <T>(fn: () => Promise<T>) => Promise<T>;
}
export type AccessResult = SignerAccess | { ok: false; reason: RefusalReason };

/** Attempts per address per 10 minutes. A real signer opens a link a handful of times; a guesser needs millions. */
export const SIGN_ATTEMPTS_PER_10_MIN = 30;

/** What the plain error page says for each refusal. Deliberately generic: it never says which part of a guess was close. */
export const REFUSAL_COPY: Record<RefusalReason, { title: string; body: string }> = {
  rate_limited: { title: "Too many attempts", body: "Please wait a few minutes and try again." },
  not_found: { title: "This link is not valid", body: "Check that you opened the whole link from your email. If it still does not work, ask the sender for a new one." },
  revoked: { title: "This link is no longer valid", body: "The sender has replaced or cancelled it. Ask them for a new link." },
  used: { title: "This link has already been used", body: "You have already answered this request, or it has been completed. No further action is needed." },
  voided: { title: "This request was cancelled", body: "The sender cancelled it. Contact them if you think this is a mistake." },
  expired: { title: "This link has expired", body: "Ask the sender to send you a new link." },
  unavailable: { title: "This page is not available", body: "Please contact the sender." },
};

export async function resolveSignerToken(token: unknown, headers: Headers, opts: { recordView?: boolean } = {}, now = new Date()): Promise<AccessResult> {
  const probe = new Request("http://signing.invalid/", { headers });
  const limited = await rateLimit(probe, "cf-sign", SIGN_ATTEMPTS_PER_10_MIN, 600);
  if (!limited.ok) return { ok: false, reason: "rate_limited" };
  if (!isWellFormedToken(token)) return { ok: false, reason: "not_found" };

  const row = await (await cfSignersAcrossCompanies()).findOne({ tokenHash: hashToken(token) });
  const companyId = row && typeof row.companyId === "string" ? row.companyId : null;
  if (!row || !companyId) return { ok: false, reason: "not_found" };

  const company = await (await getPlatformDb()).collection<{ _id: string; status: string }>("companies").findOne({ _id: companyId }, { projection: { status: 1 } });
  if (!company || company.status !== "active") return { ok: false, reason: "unavailable" };

  const ip = clientIp(probe);
  const userAgent = headers.get("user-agent");
  return runAsCompany(companyId, async () => {
    const request = await (await cfRequests()).findOne({ _id: row.requestId });
    if (!request) return { ok: false, reason: "not_found" } as const;
    await expireIfDue(request._id, now);
    const fresh = (await (await cfRequests()).findOne({ _id: request._id })) ?? request;

    const refuse = async (reason: RefusalReason): Promise<AccessResult> => {
      await appendEvent({ requestId: request._id, signerId: row._id, type: "link_rejected", actorType: "signer", actorId: row._id, ip, userAgent, data: { reason } }).catch(() => {});
      return { ok: false, reason };
    };
    if (row.tokenPurpose !== "sign") return refuse("not_found");
    if (row.tokenRevokedAt) return refuse(fresh.status === "voided" ? "voided" : fresh.status === "expired" ? "expired" : "revoked");
    if (row.tokenUsedAt || row.status === "signed" || row.status === "declined" || fresh.status === "completed" || fresh.status === "declined") return refuse("used");
    if (fresh.status === "voided") return refuse("voided");
    if (fresh.status === "expired" || now.getTime() >= row.tokenExpiresAt.getTime() || now.getTime() >= fresh.expiresAt.getTime()) return refuse("expired");

    let status = row.status;
    if (opts.recordView && row.status === "sent") {
      await (await cfSigners()).updateOne({ _id: row._id, status: "sent" }, { $set: { status: "viewed" } });
      status = "viewed";
      await appendEvent({ requestId: request._id, signerId: row._id, type: "link_viewed", actorType: "signer", actorId: row._id, ip, userAgent });
    }
    const { tokenHash: _hash, ...signer } = row;
    return { ok: true, companyId, request: fresh, signer: { ...signer, status }, identityVerified: !!signer.otpVerifiedAt && now.getTime() - signer.otpVerifiedAt.getTime() < OTP_VERIFIED_MINUTES * 60_000, inCompany: <T,>(fn: () => Promise<T>) => runAsCompany(companyId, fn) } satisfies SignerAccess;
  });
}
