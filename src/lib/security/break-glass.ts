import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The emergency sign-in for PLATFORM STAFF when their authenticator secret can't be opened (the deployment's encryption key doesn't
 * match): the exact SAAS_ADMIN_EMAIL and SAAS_ADMIN_PASSWORD of the deployment, compared in constant time. Pure; the caller decides
 * who counts as platform staff and what happens next (two-step is forced to be set up again, and the event is audited).
 */
const digest = (s: string) => createHash("sha256").update(s).digest();

export function breakGlassMatches(input: { email: string; password: string; envEmail?: string | null; envPassword?: string | null }): boolean {
  const e = input.envEmail?.trim().toLowerCase();
  const p = input.envPassword;
  if (!e || !p) return false;
  const emailOk = timingSafeEqual(digest(input.email.trim().toLowerCase()), digest(e));
  const passOk = timingSafeEqual(digest(input.password), digest(p));
  return emailOk && passOk;
}
