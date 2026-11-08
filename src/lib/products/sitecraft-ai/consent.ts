import type { TrackingSettings } from "@/lib/products/sitecraft-ai/tracking-shared";

/** The browser key that remembers a visitor's cookie choice on a company's website. */
export const CONSENT_KEY = "site-consent";
/** Raise this when what the banner promises changes: everyone is then asked again. */
export const CONSENT_VERSION = 1;

export interface StoredConsent {
  v: number;
  /** Analytics, advertising and other non-essential tracking. */
  tracking: boolean;
  at: string;
}

/** Whether the company has set up anything that tracks visitors, in which case the website must ask before loading it. */
export function trackingNeedsConsent(t: TrackingSettings): boolean {
  return t.ga4Ids.length + t.gtmIds.length + t.clarityIds.length + t.metaPixelIds.length > 0 || t.scripts.some((s) => s.enabled && s.code.trim() !== "");
}
