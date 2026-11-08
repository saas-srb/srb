/** Client-safe rules for the email-verification strip (see `email-verification.ts`). */

/** The one rule: only an explicit `false` is unverified; a missing field (legacy, invited, seeded users) is verified. */
export function isEmailVerified(user: { emailVerified?: unknown; [k: string]: unknown }): boolean {
  return user.emailVerified !== false;
}

/** Whether the Workspace shows the "Verify email" strip. */
export function showVerifyStrip(f: { emailVerified: boolean; isPlatformOwnerCompany: boolean }): boolean {
  return !f.emailVerified && !f.isPlatformOwnerCompany;
}

/** The strip is hidden on the verification page itself. */
export function verifyStripHiddenOn(pathname: string): boolean {
  return pathname.startsWith("/commandos/verify-email");
}

/**
 * Same-origin check for the verification form POST (CSRF): a browser form post carries `Sec-Fetch-Site`
 * (and `Origin`); anything cross-site is refused. Requests with neither header (non-browser clients) are allowed:
 * they hold the secret token anyway and can't ride a victim's cookies.
 */
export function isSameOriginPost(h: { secFetchSite: string | null; origin: string | null; host: string | null }): boolean {
  if (h.secFetchSite) return h.secFetchSite === "same-origin" || h.secFetchSite === "none";
  if (h.origin) {
    try {
      return new URL(h.origin).host === h.host;
    } catch {
      return false;
    }
  }
  return true;
}
