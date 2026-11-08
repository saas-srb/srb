import { err, warn, result, type FieldError, type ValidationResult } from "./types";

/**
 * LinkedIn Campaign Manager: SHAPE AND VALIDATION ONLY (capability `requires approved access`, SPEC.md section 3). Nothing here calls
 * LinkedIn. Field names and rules are from the version 202610 pages for campaign groups and campaigns.
 */

export const LINKEDIN_VERSION = "202610";
export const LINKEDIN_OBJECTIVES = ["BRAND_AWARENESS", "ENGAGEMENT", "JOB_APPLICANTS", "LEAD_GENERATION", "WEBSITE_CONVERSIONS", "WEBSITE_VISITS", "VIDEO_VIEWS"] as const;
export const LINKEDIN_CAMPAIGN_TYPES = ["TEXT_AD", "SPONSORED_UPDATES", "SPONSORED_INMAILS", "DYNAMIC"] as const;
export const LINKEDIN_COST_TYPES = ["CPM", "CPC", "CPV"] as const;
export const LINKEDIN_OPTIMIZATION_TARGETS = [
  "NONE", "ENHANCED_CONVERSION", "MAX_IMPRESSION", "MAX_CLICK", "MAX_CONVERSION", "MAX_VIDEO_VIEW", "MAX_LEAD", "MAX_QUALIFIED_LEAD", "MAX_REACH",
  "TARGET_COST_PER_CLICK", "TARGET_COST_PER_IMPRESSION", "TARGET_COST_PER_VIDEO_VIEW", "CAP_COST_AND_MAXIMIZE_CLICKS", "CAP_COST_AND_MAXIMIZE_IMPRESSIONS", "CAP_COST_AND_MAXIMIZE_VIDEO_VIEWS", "CAP_COST_AND_MAXIMIZE_LEADS",
] as const;
/** Targets that need a unit cost (manual bid, target cost, cost cap). */
const NEEDS_UNIT_COST = new Set(["TARGET_COST_PER_CLICK", "TARGET_COST_PER_IMPRESSION", "TARGET_COST_PER_VIDEO_VIEW", "CAP_COST_AND_MAXIMIZE_CLICKS", "CAP_COST_AND_MAXIMIZE_IMPRESSIONS", "CAP_COST_AND_MAXIMIZE_VIDEO_VIEWS", "CAP_COST_AND_MAXIMIZE_LEADS"]);
export const LINKEDIN_MAX_ACTIVE_CREATIVES = 15;

export interface LinkedInMoney {
  amount: string;
  currencyCode: string;
}
export interface LinkedInCampaignGroupDraft {
  accountId: string;
  name: string;
  runStartMs: number;
  runEndMs: number | null;
  totalBudget: LinkedInMoney | null;
}
export interface LinkedInCampaignDraft {
  accountId: string;
  campaignGroupId: string | null;
  name: string;
  type: (typeof LINKEDIN_CAMPAIGN_TYPES)[number];
  objectiveType: (typeof LINKEDIN_OBJECTIVES)[number] | null;
  costType: (typeof LINKEDIN_COST_TYPES)[number];
  unitCost: LinkedInMoney | null;
  dailyBudget: LinkedInMoney | null;
  totalBudget: LinkedInMoney | null;
  runStartMs: number;
  runEndMs: number | null;
  locale: { country: string; language: string };
  optimizationTargetType: (typeof LINKEDIN_OPTIMIZATION_TARGETS)[number];
  audienceExpansionEnabled: boolean;
  offsiteDeliveryEnabled: boolean;
  creativeSelection: "OPTIMIZED" | "ROUND_ROBIN";
  /** urn:li:organization:{id} - required for Sponsored Content, Dynamic ads and Lead Gen forms. */
  associatedEntity: string | null;
  /** urn:li:adTargetingFacet:... -> list of URNs. Facet names are not verified beyond interfaceLocales. */
  targetingInclude: Record<string, string[]>;
}

export function validateLinkedInCampaignGroup(g: LinkedInCampaignGroupDraft): ValidationResult {
  const out: FieldError[] = [];
  if (!/^\d+$/.test(g.accountId)) out.push(err("linkedin.accountId", "account_id", "A LinkedIn ad account id is a number."));
  if (!g.name.trim()) out.push(err("linkedin.group.name", "name_required", "Give the campaign group a name."));
  if (new TextEncoder().encode(g.name).length > 200) out.push(err("linkedin.group.name", "name_max", "A campaign group name can be at most 200 bytes."));
  if (!(g.runStartMs > 0)) out.push(err("linkedin.group.runSchedule.start", "start_required", "A start date is required."));
  if (g.totalBudget && g.runEndMs === null) out.push(err("linkedin.group.runSchedule.end", "end_required", "A total budget needs an end date."));
  if (g.runEndMs !== null && g.runEndMs <= g.runStartMs) out.push(err("linkedin.group.runSchedule.end", "end_order", "The end is before the start."));
  out.push(warn("linkedin", "requires_access", "LinkedIn launches need the Advertising API product approved by LinkedIn; this version only checks the request and does not send it."));
  return result(out);
}

export function validateLinkedInCampaign(c: LinkedInCampaignDraft, accountCurrency: string): ValidationResult {
  const out: FieldError[] = [];
  const b = "linkedin.campaign";
  if (!c.name.trim()) out.push(err(`${b}.name`, "name_required", "Give the campaign a name."));
  if (!c.dailyBudget && !c.totalBudget) out.push(err(`${b}.dailyBudget`, "budget_required", "Set a daily or a total budget."));
  for (const [k, m] of [["dailyBudget", c.dailyBudget], ["totalBudget", c.totalBudget], ["unitCost", c.unitCost]] as const) {
    if (!m) continue;
    if (m.currencyCode !== accountCurrency) out.push(err(`${b}.${k}.currencyCode`, "currency", `The currency must be the ad account's (${accountCurrency}).`));
    if (!(Number(m.amount) > 0) && k !== "unitCost") out.push(err(`${b}.${k}.amount`, "amount", "Enter an amount above zero."));
  }
  if (c.totalBudget && c.runEndMs === null) out.push(err(`${b}.runSchedule.end`, "end_required", "A total budget needs an end date."));
  if (c.runEndMs !== null && c.runEndMs <= c.runStartMs) out.push(err(`${b}.runSchedule.end`, "end_order", "The end is before the start."));
  if (!/^[A-Z]{2}$/.test(c.locale.country) || !/^[a-z]{2}$/.test(c.locale.language)) out.push(err(`${b}.locale`, "locale", "Locale needs an uppercase country (US) and a lowercase language (en)."));
  if (NEEDS_UNIT_COST.has(c.optimizationTargetType) && !(c.unitCost && Number(c.unitCost.amount) > 0)) out.push(err(`${b}.unitCost`, "unit_cost", "This bidding choice needs a bid amount."));
  if (c.optimizationTargetType.startsWith("CAP_COST") && c.costType !== "CPM") out.push(err(`${b}.costType`, "cost_cap_cpm", "Cost cap bidding is charged by impression (CPM)."));
  if (c.optimizationTargetType.startsWith("MAX_") && c.costType !== "CPM" && c.objectiveType !== null) out.push(warn(`${b}.costType`, "auto_cpm", "Automated bidding on objective-based campaigns is charged by impression (CPM)."));
  if (c.objectiveType === "LEAD_GENERATION" && c.offsiteDeliveryEnabled) out.push(err(`${b}.offsiteDeliveryEnabled`, "lan_leadgen", "The LinkedIn Audience Network cannot be used with Lead Generation."));
  if ((c.type === "SPONSORED_UPDATES" || c.type === "DYNAMIC" || c.objectiveType === "LEAD_GENERATION") && !c.associatedEntity) out.push(err(`${b}.associatedEntity`, "entity_required", "Choose the company page this advertises."));
  if (c.type === "TEXT_AD" && c.offsiteDeliveryEnabled) out.push(err(`${b}.offsiteDeliveryEnabled`, "lan_text", "The LinkedIn Audience Network is not available for text ads."));
  if (Object.keys(c.targetingInclude).length === 0) out.push(err(`${b}.targeting`, "targeting_required", "Choose at least one audience attribute (for example a location)."));
  if (!c.campaignGroupId) out.push(warn(`${b}.campaignGroup`, "group", "No campaign group chosen; LinkedIn uses the account's default group."));
  out.push(warn("linkedin", "requires_access", "LinkedIn launches need the Advertising API product approved by LinkedIn; this version only checks the request and does not send it."));
  return result(out);
}

const money = (m: LinkedInMoney | null) => (m ? { amount: m.amount, currencyCode: m.currencyCode } : undefined);

/** Request bodies in the documented shape (POST /rest/adAccounts/{id}/adCampaigns, created PAUSED... status DRAFT is also valid). */
export function buildLinkedInCampaignBody(c: LinkedInCampaignDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    account: `urn:li:sponsoredAccount:${c.accountId}`,
    name: c.name,
    type: c.type,
    costType: c.costType,
    locale: c.locale,
    runSchedule: { start: c.runStartMs, ...(c.runEndMs !== null ? { end: c.runEndMs } : {}) },
    optimizationTargetType: c.optimizationTargetType,
    audienceExpansionEnabled: c.audienceExpansionEnabled,
    offsiteDeliveryEnabled: c.offsiteDeliveryEnabled,
    creativeSelection: c.creativeSelection,
    status: "PAUSED",
    targetingCriteria: { include: { and: Object.entries(c.targetingInclude).map(([facet, urns]) => ({ or: { [facet]: urns } })) } },
  };
  if (c.campaignGroupId) body.campaignGroup = `urn:li:sponsoredCampaignGroup:${c.campaignGroupId}`;
  if (c.objectiveType) body.objectiveType = c.objectiveType;
  if (c.associatedEntity) body.associatedEntity = c.associatedEntity;
  if (c.dailyBudget) body.dailyBudget = money(c.dailyBudget);
  if (c.totalBudget) body.totalBudget = money(c.totalBudget);
  if (c.unitCost) body.unitCost = money(c.unitCost);
  return body;
}

export const linkedInHeaders = (token: string, version: string = LINKEDIN_VERSION) => ({ Authorization: `Bearer ${token}`, "Linkedin-Version": version, "X-Restli-Protocol-Version": "2.0.0" });
