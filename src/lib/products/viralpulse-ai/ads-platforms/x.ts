import { err, warn, result, type FieldError, type ValidationResult } from "./types";

/**
 * X Ads: SHAPE AND VALIDATION ONLY (capability `requires approved access`, SPEC.md section 4). Nothing here calls X.
 * Verified (docs.x.com hierarchy page): account -> funding instrument -> campaign -> line item -> creatives; 100 line items per campaign,
 * 200 active campaigns and 4,000 active line items per account; every campaign needs a funding instrument; every line item needs a creative.
 * Not verified (the field reference could not be fetched): objective and placement enums, so they are free strings checked only for presence.
 */

export const X_LIMITS = { lineItemsPerCampaign: 100, activeCampaignsPerAccount: 200, activeLineItemsPerAccount: 4000 };

export interface XCampaignDraft {
  accountId: string;
  fundingInstrumentId: string;
  name: string;
  /** Local-currency micros (1 unit = 1,000,000). */
  dailyBudgetMicros: number | null;
  totalBudgetMicros: number | null;
  startTime: string | null;
  endTime: string | null;
  lineItems: { name: string; objective: string; placements: string[]; bidAmountMicros: number | null; tweetIds: string[] }[];
}

export function validateXCampaign(d: XCampaignDraft, counts: { activeCampaigns?: number; activeLineItems?: number } = {}): ValidationResult {
  const out: FieldError[] = [];
  if (!/^[a-z0-9]+$/i.test(d.accountId)) out.push(err("x.accountId", "account_id", "An X ads account id is letters and digits."));
  if (!d.fundingInstrumentId) out.push(err("x.fundingInstrumentId", "funding", "Choose a funding instrument; every X campaign needs one."));
  if (!d.name.trim()) out.push(err("x.name", "name_required", "Give the campaign a name."));
  if (!d.dailyBudgetMicros && !d.totalBudgetMicros) out.push(err("x.dailyBudgetMicros", "budget_required", "Set a daily or total budget."));
  if (d.startTime && d.endTime && d.endTime <= d.startTime) out.push(err("x.endTime", "end_order", "The end is before the start."));
  if (d.lineItems.length === 0) out.push(err("x.lineItems", "line_item_required", "Add at least one line item."));
  if (d.lineItems.length > X_LIMITS.lineItemsPerCampaign) out.push(err("x.lineItems", "line_items_max", `A campaign can have at most ${X_LIMITS.lineItemsPerCampaign} line items.`));
  if (new Set(d.lineItems.map((l) => l.objective)).size > 1) out.push(err("x.lineItems", "objective_mixed", "All line items in a campaign must have the same objective."));
  d.lineItems.forEach((l, i) => {
    if (!l.name.trim()) out.push(err(`x.lineItems[${i}].name`, "name_required", "Give the line item a name."));
    if (!l.objective) out.push(err(`x.lineItems[${i}].objective`, "objective_required", "Choose an objective."));
    if (l.placements.length === 0) out.push(err(`x.lineItems[${i}].placements`, "placements_required", "Choose where the ads run."));
    if (l.tweetIds.length === 0) out.push(err(`x.lineItems[${i}].tweetIds`, "creative_required", "Each line item needs at least one promoted post to run."));
  });
  if (counts.activeCampaigns !== undefined && counts.activeCampaigns >= X_LIMITS.activeCampaignsPerAccount) out.push(err("x", "campaigns_cap", "The account is at its limit of 200 active campaigns (paused campaigns count)."));
  if (counts.activeLineItems !== undefined && counts.activeLineItems + d.lineItems.length > X_LIMITS.activeLineItemsPerAccount) out.push(err("x", "line_items_cap", "This would exceed 4,000 active line items on the account."));
  out.push(warn("x", "requires_access", "X Ads launches need approved Ads API access; this version only checks the request and does not send it."));
  return result(out);
}
