import { err, warn, result, type FieldError, type ValidationResult } from "./types";

/**
 * Google Ads: SHAPE AND VALIDATION ONLY (capability `requires approved access`, see SPEC.md section 2). Nothing here calls Google.
 * Only limits verified in the docs are enforced as errors; the rest is structure.
 * Verified: API v26.1 (2026-10-28), scope adwords, access is per Cloud project (developer tokens retired 2026-09-09), RSA headline 30 / description 90.
 */

export const GOOGLE_ADS_API_VERSION = "v26";
export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const RSA_HEADLINE_MAX = 30;
export const RSA_DESCRIPTION_MAX = 90;
/** Responsive search ads take 3 to 15 headlines and 2 to 4 descriptions. */
export const RSA_HEADLINES = { min: 3, max: 15 };
export const RSA_DESCRIPTIONS = { min: 2, max: 4 };

export interface GoogleSearchCampaignDraft {
  customerId: string;
  name: string;
  /** Daily budget in micros of the account currency (1 unit = 1,000,000 micros). */
  dailyBudgetMicros: number;
  /** YYYY-MM-DD */
  startDate: string | null;
  endDate: string | null;
  keywords: { text: string; matchType: "BROAD" | "PHRASE" | "EXACT" }[];
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
}

export function validateGoogleSearch(d: GoogleSearchCampaignDraft): ValidationResult {
  const out: FieldError[] = [];
  if (!/^\d{10}$/.test(d.customerId.replace(/-/g, ""))) out.push(err("google.customerId", "customer_id", "A Google Ads customer id has 10 digits."));
  if (!d.name.trim()) out.push(err("google.name", "name_required", "Give the campaign a name."));
  if (!(d.dailyBudgetMicros > 0)) out.push(err("google.dailyBudgetMicros", "budget_required", "Set a daily budget."));
  if (d.startDate && d.endDate && d.endDate < d.startDate) out.push(err("google.endDate", "end_order", "The end is before the start."));
  if (!/^https:\/\//i.test(d.finalUrl)) out.push(err("google.finalUrl", "url_https", "The final URL must be a full https:// address."));
  if (d.keywords.length === 0) out.push(err("google.keywords", "keywords_required", "Add at least one keyword."));
  if (d.headlines.length < RSA_HEADLINES.min || d.headlines.length > RSA_HEADLINES.max) out.push(err("google.headlines", "headlines_count", `A responsive search ad needs ${RSA_HEADLINES.min} to ${RSA_HEADLINES.max} headlines.`));
  if (d.descriptions.length < RSA_DESCRIPTIONS.min || d.descriptions.length > RSA_DESCRIPTIONS.max) out.push(err("google.descriptions", "descriptions_count", `A responsive search ad needs ${RSA_DESCRIPTIONS.min} to ${RSA_DESCRIPTIONS.max} descriptions.`));
  d.headlines.forEach((h, i) => h.length > RSA_HEADLINE_MAX && out.push(err(`google.headlines[${i}]`, "headline_max", `Headlines can be at most ${RSA_HEADLINE_MAX} characters.`)));
  d.descriptions.forEach((h, i) => h.length > RSA_DESCRIPTION_MAX && out.push(err(`google.descriptions[${i}]`, "description_max", `Descriptions can be at most ${RSA_DESCRIPTION_MAX} characters.`)));
  out.push(warn("google", "requires_access", "Google Ads launches need an approved Google Cloud project; this version only checks the request and does not send it."));
  return result(out);
}

/** The mutate operations in the order Google requires (budget, campaign, ad group, ad, keywords). Shape only. */
export function buildGoogleSearchOperations(d: GoogleSearchCampaignDraft): { resource: string; operation: Record<string, unknown> }[] {
  const customer = d.customerId.replace(/-/g, "");
  const budgetName = `customers/${customer}/campaignBudgets/-1`;
  const campaignName = `customers/${customer}/campaigns/-2`;
  const adGroupName = `customers/${customer}/adGroups/-3`;
  return [
    { resource: "campaignBudgets", operation: { create: { resourceName: budgetName, name: `${d.name} budget`, amountMicros: String(d.dailyBudgetMicros), deliveryMethod: "STANDARD" } } },
    { resource: "campaigns", operation: { create: { resourceName: campaignName, name: d.name, advertisingChannelType: "SEARCH", status: "PAUSED", campaignBudget: budgetName, ...(d.startDate ? { startDate: d.startDate.replaceAll("-", "") } : {}), ...(d.endDate ? { endDate: d.endDate.replaceAll("-", "") } : {}) } } },
    { resource: "adGroups", operation: { create: { resourceName: adGroupName, name: `${d.name} ad group`, campaign: campaignName, status: "PAUSED", type: "SEARCH_STANDARD" } } },
    { resource: "adGroupAds", operation: { create: { adGroup: adGroupName, status: "PAUSED", ad: { finalUrls: [d.finalUrl], responsiveSearchAd: { headlines: d.headlines.map((text) => ({ text })), descriptions: d.descriptions.map((text) => ({ text })) } } } } },
    { resource: "adGroupCriteria", operation: { create: d.keywords.map((k) => ({ adGroup: adGroupName, status: "ENABLED", keyword: { text: k.text, matchType: k.matchType } })) } },
  ];
}
