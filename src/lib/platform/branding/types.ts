/**
 * A company's brand as the products, emails and documents show it. Client-safe
 * (no data access) — the server resolves it once per request and hands it to
 * the client through `BrandProvider`.
 */
export interface CompanyBrand {
  /** Plain display name, e.g. "Acme Labs" — titles, emails, documents. */
  name: string;
  /** Two-tone wordmark: `namePrimary` in the text colour, `nameAccent` in the accent colour. */
  namePrimary: string;
  nameAccent: string;
  /** Uploaded logo (square works best), or null for the built-in mark. */
  logoUrl: string | null;
  /** Brand accent colour as `#rrggbb`, or null for the platform default. */
  primaryColor: string | null;
  /** Full logo (mark + wordmark) for light / dark backgrounds. Set only for the SelfRun product itself; companies never have it. */
  wordmarkUrl?: string | null;
  wordmarkDarkUrl?: string | null;
  /** The platform owner keeps the platform's own built-in logo mark. */
  isPlatformOwner: boolean;
}

/** Stored on the company registry document (`companies.branding`). */
export interface StoredBranding {
  namePrimary?: string;
  nameAccent?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

export const NEUTRAL_BRAND: CompanyBrand = { name: "", namePrimary: "", nameAccent: "", logoUrl: null, primaryColor: null, isPlatformOwner: false };

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

/** Initials for the monogram shown when a company has no logo yet ("Acme Labs" → "AL"). */
export function brandInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2)).toUpperCase();
}
