import type { CampaignPlatform } from "@/lib/utm";
import type { ThemedColor } from "@/lib/category-colors";

export type { CampaignPlatform } from "@/lib/utm";

/**
 * The three ad platforms the business runs campaigns on. `value` is what's
 * stored on `campaigns.platform` and (for attributed leads) on `lead.source`.
 * Colours follow the CATEGORY_CHART_COLORS convention — validated light/dark
 * pairs so charts stay legible on both admin surfaces.
 */
export const CAMPAIGN_PLATFORMS: {
  value: CampaignPlatform;
  label: string;
  shortLabel: string;
  color: ThemedColor;
}[] = [
  { value: "meta", label: "Meta (Facebook & Instagram)", shortLabel: "Meta", color: { light: "#2a78d6", dark: "#3987e5" } },
  { value: "google", label: "Google Ads", shortLabel: "Google", color: { light: "#eb6834", dark: "#d95926" } },
  { value: "linkedin", label: "LinkedIn", shortLabel: "LinkedIn", color: { light: "#1baf7a", dark: "#199e70" } },
];

export function isValidPlatform(value: string): value is CampaignPlatform {
  return CAMPAIGN_PLATFORMS.some((p) => p.value === value);
}

export function getPlatformMeta(value: string) {
  return CAMPAIGN_PLATFORMS.find((p) => p.value === value) ?? { value, label: value, shortLabel: value, color: { light: "#64748b", dark: "#94a3b8" } };
}

export type CampaignDeliveryStatus = "active" | "paused" | "ended" | "unknown";

export const CAMPAIGN_STATUSES: { value: Exclude<CampaignDeliveryStatus, "unknown">; label: string; dotClass: string }[] = [
  { value: "active", label: "Active", dotClass: "bg-green-500" },
  { value: "paused", label: "Paused", dotClass: "bg-amber-500" },
  { value: "ended", label: "Ended", dotClass: "bg-muted-foreground/50" },
];

export function isValidCampaignStatus(value: string): value is CampaignDeliveryStatus {
  return value === "active" || value === "paused" || value === "ended" || value === "unknown";
}

/**
 * Map a platform's own "delivery"/"state"/"status" column value onto our
 * normalized status. Platforms use wildly different vocabularies here.
 */
export function normalizeDeliveryStatus(raw: string | undefined | null): CampaignDeliveryStatus {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "unknown";
  if (/(^|\b)(active|delivering|enabled|running|live)\b/.test(v)) return "active";
  if (/(pause|inactive|off|not delivering|draft|scheduled|in review|pending)/.test(v)) return "paused";
  if (/(complete|completed|ended|finished|archiv|removed|expired|deleted)/.test(v)) return "ended";
  return "unknown";
}

export type ImportKind = "performance" | "leads";

export function isValidImportKind(value: string): value is ImportKind {
  return value === "performance" || value === "leads";
}
