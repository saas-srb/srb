/**
 * The exact redirect (callback) URL a company must register in its Meta / Google / LinkedIn / X app. The OAuth start route and the
 * callback route both build it from this helper, and Settings > Integrations shows the same string, so the on-screen text can never
 * drift from what the code sends (the old Platform Console note omitted `/callback`).
 */
export const OAUTH_REDIRECT_PROVIDERS = ["meta", "google", "linkedin", "x"] as const;

export function oauthRedirectPath(provider: string): string {
  return `/api/viralpulse-ai/oauth/${provider}/callback`;
}

/** `origin` = the public address the user opens the app on (`https://app.example.com`, no path). */
export function oauthRedirectUrl(provider: string, origin: string): string {
  return new URL(oauthRedirectPath(provider), origin).toString();
}

/** The public origin of the current request: honours the proxy headers (host / x-forwarded-*), like Next's own request URL. */
export function originFromHeaders(h: { get(name: string): string | null }, fallbackOrigin?: string): string | null {
  const host = (h.get("x-forwarded-host") ?? h.get("host"))?.split(",")[0].trim();
  if (!host) return fallbackOrigin ?? null;
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (/^(localhost|127\.|\[::1\]|.*\.localhost)(:|$)/.test(host) ? "http" : "https");
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return fallbackOrigin ?? null;
  }
}
