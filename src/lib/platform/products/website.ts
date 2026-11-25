/**
 * What a company's SITE address serves when we don't run its website: the working public pages (payment links,
 * certificate checks, signing, the hosted forms, portal sign-in) stay; everything of the marketing site leads to the
 * company's own website or to the hosted forms. Pure.
 */
const KEPT = new Set(["forms", "pay", "verify", "sign", "meeting", "vcard", "brochure", "login", "register", "clientos", "evaliq", "agentos-public", "api", "product-unavailable", "workspace-not-found", "company-suspended", "maintenance", "console-maintenance", "offline-shell", "platform-maintenance"]);

/** Where an old website address leads instead; null = serve it. `externalUrl` = the company's own website, if it gave one. */
export function websitelessTarget(pathname: string, externalUrl: string | null): string | null {
  const first = pathname.split("/")[1] ?? "";
  if (KEPT.has(first)) return null;
  if (first === "careers") return "/forms/careers";
  if (first === "contact") return "/forms/enquiry";
  return externalUrl ?? "/forms";
}

/** The origin allowed to frame the hosted forms: the company's own website. */
export function embedOrigin(externalUrl: string | null | undefined): string | null {
  if (!externalUrl) return null;
  try {
    const url = new URL(externalUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}
