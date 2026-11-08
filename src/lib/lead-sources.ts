// Lead `source` values. The first two are what the public forms set directly.
// The three platform values are set automatically when a lead lands with a
// recognised `utm_source` (see src/lib/utm.ts `inferPlatform`) or when a
// platform lead-list CSV is imported and matched (see src/lib/campaigns.ts).
export const LEAD_SOURCES = [
  { value: "contact-page", label: "Contact Page" },
  { value: "homepage-hero", label: "Homepage Hero" },
  { value: "meta", label: "Meta Ads" },
  { value: "google", label: "Google Ads" },
  { value: "linkedin", label: "LinkedIn Ads" },
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number]["value"];

export function getLeadSourceLabel(value: string | undefined): string {
  if (!value) return "—";
  return LEAD_SOURCES.find((s) => s.value === value)?.label ?? value;
}
