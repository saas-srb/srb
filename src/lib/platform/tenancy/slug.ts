/**
 * Workspace address (slug) rules — client-safe, shared by the sign-up form
 * (instant feedback) and the server (the authority).
 */

/** Subdomains that can never be a company slug. */
export const RESERVED_SLUGS = new Set(["www", "app", "api", "admin", "mail", "static", "cdn", "assets", "platform", "status", "help", "docs", "signup", "login", "support", "billing", "blog"]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;

/** Why a workspace address can't be used, or null when its format is fine (availability is separate). */
export function slugFormatError(slug: string): string | null {
  if (!slug) return "Choose a workspace address.";
  if (slug.length < 3) return "Use at least 3 characters.";
  if (!SLUG_RE.test(slug)) return "Use lowercase letters, numbers and hyphens (not at the start or end).";
  if (RESERVED_SLUGS.has(slug)) return "That address is reserved.";
  // `<slug>-app` is the address of a company's products, so no slug may look like one.
  if (slug.endsWith("-app")) return "Addresses can't end with \"-app\".";
  return null;
}

/** "Acme Labs Pvt. Ltd." → "acme-labs" (a suggestion; the user can edit it). */
export function slugFromName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(pvt|private|ltd|limited|llp|inc|llc|corp|co)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  if (!base) return "";
  return base.length >= 3 ? base : `${base}-hq`;
}
