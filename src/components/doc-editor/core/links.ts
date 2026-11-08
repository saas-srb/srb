import { ALLOWED_LINK_SCHEMES, PBDOC_LIMITS } from "@/lib/products/playbook-ai/doc/limits";

/** A link address exactly as the PBDoc validator accepts it: absolute, one of the allowed schemes, bounded length. Returns null when unsafe. */
export function safeHref(input: string | null | undefined): string | null {
  const href = (input ?? "").trim();
  if (!href || href.length > PBDOC_LIMITS.maxHref || /[\u0000-\u001f\u007f\s]/.test(href)) return null;
  try {
    const u = new URL(href);
    return (ALLOWED_LINK_SCHEMES as readonly string[]).includes(u.protocol) ? href : null;
  } catch {
    return null;
  }
}

/** Lenient version for what a person types in the link box: "example.com", "a@b.com" and "+91 98765 43210" are completed first. */
export function normalizeHref(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return safeHref(raw);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return safeHref(`mailto:${raw}`);
  if (/^\+?[\d\s()-]{6,20}$/.test(raw) && /\d{6,}/.test(raw.replace(/\D/g, ""))) return safeHref(`tel:${raw.replace(/[\s()-]/g, "")}`);
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i.test(raw)) return safeHref(`https://${raw}`);
  return null;
}
