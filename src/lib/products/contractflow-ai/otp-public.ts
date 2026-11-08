import "server-only";
import { checkCode, isIdentityVerified, sendCode } from "./otp";
import { resolveSignerToken, type RefusalReason } from "./public-access";
import type { OtpChannel } from "./sign-types";

/**
 * The public entry points the signer page (B4) calls. A code can only be asked for or checked through a valid link: the link opens the
 * signer, the code proves who is holding it, and signing needs both. The company comes from the link's request, as everywhere else.
 */
export type TokenOtpResult<T> = { ok: true; value: T } | { ok: false; reason: RefusalReason } ;

export async function sendCodeForToken(token: unknown, channel: OtpChannel, headers: Headers): Promise<TokenOtpResult<Awaited<ReturnType<typeof sendCode>>>> {
  const access = await resolveSignerToken(token, headers);
  if (!access.ok) return access;
  return { ok: true, value: await access.inCompany(() => sendCode(access.signer._id, channel, headers)) };
}

export async function checkCodeForToken(token: unknown, code: unknown, headers: Headers): Promise<TokenOtpResult<Awaited<ReturnType<typeof checkCode>>>> {
  const access = await resolveSignerToken(token, headers);
  if (!access.ok) return access;
  return { ok: true, value: await access.inCompany(() => checkCode(access.signer._id, code, headers)) };
}

/** Whether this link's holder has passed the code check recently enough to sign. */
export async function identityVerifiedForToken(token: unknown, headers: Headers): Promise<boolean> {
  const access = await resolveSignerToken(token, headers);
  return access.ok ? access.inCompany(() => isIdentityVerified(access.signer._id)) : false;
}
