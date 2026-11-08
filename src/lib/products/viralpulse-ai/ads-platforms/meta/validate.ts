import { err, warn, result, type FieldError, type ValidationResult } from "../types";
import { BID_AMOUNT_STRATEGIES, COUNTRY_RE, EU_COUNTRIES, OBJECTIVE_RULES, META_CTA_TYPES, META_OBJECTIVE_LABEL, FACEBOOK_POSITIONS, INSTAGRAM_POSITIONS, MESSENGER_POSITIONS, AUDIENCE_NETWORK_POSITIONS, PUBLISHER_PLATFORMS, DEVICE_PLATFORMS, META_NO_CAP, type MetaOptimizationGoal } from "./constants";
import type { MetaAdDraft, MetaAdSetDraft, MetaCampaignDraft, MetaTargetingDraft } from "./draft";

/**
 * Pure launch validation for Meta. Hard errors are rules the API documents (SPEC.md section 1); things the docs only recommend
 * (text lengths shown, aspect ratios per placement) are warnings so we never block a launch on a guess. Paths address the draft, e.g.
 * `meta.adSets[0].budget.amountMinor` or `ads[<id>].meta.link`, so a wizard can attach each message to its field.
 */

export interface MetaAccountFacts {
  currency: string;
  /** account_status from the ad account. */
  status: number | null;
  minDailyBudgetMinor: number | null;
  minSpendCapMinor: number | null;
  defaultDsaPayor?: string | null;
  defaultDsaBeneficiary?: string | null;
}

export interface MediaFacts {
  id: string;
  kind: "image" | "video";
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

export interface AdForValidation {
  id: string;
  name: string;
  format: "image" | "video";
  headline: string;
  primaryText: string;
  description: string;
  mediaIds: string[];
  meta: MetaAdDraft;
}

export interface LaunchValidationInput {
  campaign: MetaCampaignDraft;
  ads: AdForValidation[];
  media: MediaFacts[];
  account: MetaAccountFacts | null;
  now?: Date;
}

const MB = 1024 * 1024;
export const DEMOGRAPHIC_KINDS = ["life_events", "industries", "income", "family_statuses"];
export const META_IMAGE_MAX_BYTES = 30 * MB;
export const META_VIDEO_MAX_BYTES = 4 * 1024 * MB;
const ASPECT_TOLERANCE = 0.03;
const ratioNear = (w: number, h: number, target: number) => Math.abs(w / h - target) / target <= ASPECT_TOLERANCE;
const https = (u: string) => /^https:\/\/[^\s]+$/i.test(u);

const POSITION_LISTS: [keyof MetaTargetingDraft["placements"], readonly string[], string][] = [
  ["publisherPlatforms", PUBLISHER_PLATFORMS, "publisher platform"],
  ["facebookPositions", FACEBOOK_POSITIONS, "Facebook position"],
  ["instagramPositions", INSTAGRAM_POSITIONS, "Instagram position"],
  ["messengerPositions", MESSENGER_POSITIONS, "Messenger position"],
  ["audienceNetworkPositions", AUDIENCE_NETWORK_POSITIONS, "Audience Network position"],
  ["devicePlatforms", DEVICE_PLATFORMS, "device"],
];

export function validatePlacements(p: MetaTargetingDraft["placements"], goal: MetaOptimizationGoal | null, base: string): FieldError[] {
  const out: FieldError[] = [];
  if (p.automatic) return out;
  for (const [k, allowed, label] of POSITION_LISTS) {
    for (const v of p[k] as string[]) if (!allowed.includes(v)) out.push(err(`${base}.${k}`, "placement_unknown", `"${v}" is not a ${label} Meta accepts.`));
  }
  const pub = p.publisherPlatforms;
  const mobileOnly = p.devicePlatforms.length > 0 && !p.devicePlatforms.includes("desktop");
  if (pub.length === 0 && p.facebookPositions.length + p.instagramPositions.length + p.messengerPositions.length + p.audienceNetworkPositions.length === 0) {
    out.push(err(`${base}.publisherPlatforms`, "placement_none", "Choose at least one placement, or switch to Advantage+ placements."));
  }
  if (pub.length === 1 && pub[0] === "audience_network") out.push(err(`${base}.publisherPlatforms`, "an_alone", "Audience Network cannot be the only placement."));
  const fb = p.facebookPositions;
  const ig = p.instagramPositions;
  if (pub.length > 0) {
    if (fb.length && !pub.includes("facebook")) out.push(err(`${base}.facebookPositions`, "fb_pos_platform", "Facebook positions need Facebook in the platforms."));
    if (ig.length && !pub.includes("instagram")) out.push(err(`${base}.instagramPositions`, "ig_pos_platform", "Instagram positions need Instagram in the platforms."));
    if (p.messengerPositions.length && !pub.includes("messenger")) out.push(err(`${base}.messengerPositions`, "msg_pos_platform", "Messenger positions need Messenger in the platforms."));
    if (p.audienceNetworkPositions.length && !pub.includes("audience_network")) out.push(err(`${base}.audienceNetworkPositions`, "an_pos_platform", "Audience Network positions need Audience Network in the platforms."));
  }
  if (p.messengerPositions.includes("sponsored_messages") && (p.messengerPositions.length > 1 || fb.length || ig.length || p.audienceNetworkPositions.length)) {
    out.push(err(`${base}.messengerPositions`, "sponsored_alone", "Sponsored messages cannot be combined with any other placement."));
  }
  if (fb.includes("story") && !fb.includes("feed") && !ig.includes("story")) out.push(err(`${base}.facebookPositions`, "fb_story_alone", "Facebook Stories needs Facebook Feed or Instagram Stories selected too."));
  if (p.messengerPositions.includes("story") && !fb.includes("feed") && !ig.includes("story")) out.push(err(`${base}.messengerPositions`, "msg_story_alone", "Messenger Stories needs Facebook Feed or Instagram Stories selected too."));
  if ((fb.includes("story") || p.messengerPositions.includes("story")) && p.devicePlatforms.includes("desktop")) out.push(err(`${base}.devicePlatforms`, "story_mobile", "Stories placements run on mobile only."));
  if ((fb.includes("story") || p.messengerPositions.includes("story")) && !mobileOnly && p.devicePlatforms.length > 0) out.push(err(`${base}.devicePlatforms`, "story_mobile", "Stories placements run on mobile only."));
  for (const need of ["marketplace", "search", "profile_feed", "notification"]) if (fb.includes(need) && !fb.includes("feed")) out.push(err(`${base}.facebookPositions`, "needs_feed", `Facebook "${need}" needs Facebook Feed selected too.`));
  if (fb.includes("right_hand_column") && goal && !["LINK_CLICKS", "LANDING_PAGE_VIEWS", "OFFSITE_CONVERSIONS", "IMPRESSIONS", "REACH"].includes(goal)) out.push(err(`${base}.facebookPositions`, "rhc_objective", "The right column only supports traffic and conversion goals."));
  if (fb.includes("instream_video") && goal && !["THRUPLAY", "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS", "POST_ENGAGEMENT", "IMPRESSIONS", "REACH"].includes(goal)) out.push(err(`${base}.facebookPositions`, "instream_objective", "In-stream video only supports video view and engagement goals."));
  if ((pub.includes("audience_network") || p.audienceNetworkPositions.length) && (goal === "THRUPLAY" || goal === "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS") && goal !== "THRUPLAY") out.push(err(`${base}.publisherPlatforms`, "an_thruplay", "Audience Network with video views must optimise for ThruPlay."));
  return out;
}

export function validateTargeting(t: MetaTargetingDraft, goal: MetaOptimizationGoal | null, base: string, specialCategories: boolean): FieldError[] {
  const out: FieldError[] = [];
  const g = t.geo;
  const places = g.countries.length + g.regions.length + g.cities.length + g.zips.length;
  if (places === 0 && t.customAudiences.length === 0) out.push(err(`${base}.geo`, "geo_required", "Choose at least one country, region, city or postcode, or use a custom audience."));
  for (const c of g.countries) if (!COUNTRY_RE.test(c)) out.push(err(`${base}.geo.countries`, "country_code", `"${c}" is not a two-letter country code.`));
  if (g.regions.length > 200) out.push(err(`${base}.geo.regions`, "regions_max", "Meta allows at most 200 regions."));
  if (g.cities.length > 250) out.push(err(`${base}.geo.cities`, "cities_max", "Meta allows at most 250 cities."));
  if (g.zips.length > 50_000) out.push(err(`${base}.geo.zips`, "zips_max", "Meta allows at most 50,000 postcodes."));
  g.cities.forEach((c, i) => {
    if (c.radius === undefined) return;
    const unit = c.distanceUnit ?? "mile";
    const [lo, hi] = unit === "kilometer" ? [17, 80] : [10, 50];
    if (c.radius < lo || c.radius > hi) out.push(err(`${base}.geo.cities[${i}].radius`, "city_radius", `A city radius must be ${lo} to ${hi} ${unit === "kilometer" ? "km" : "miles"}.`));
  });
  if (g.cities.some((c) => c.radius !== undefined) && places - g.cities.filter((c) => c.radius !== undefined).length > 0) out.push(warn(`${base}.geo`, "radius_multi", "A radius combined with other locations can be rejected by Meta. Use it on a single location."));
  if (t.ageMin < 13) out.push(err(`${base}.ageMin`, "age_min", "The minimum age cannot be below 13."));
  if (t.ageMax > 65) out.push(err(`${base}.ageMax`, "age_max", "The maximum age cannot be above 65."));
  if (t.ageMin > t.ageMax) out.push(err(`${base}.ageMin`, "age_order", "The minimum age is above the maximum age."));
  if (t.ageMin < 18) out.push(warn(`${base}.ageMin`, "age_minor", "Targeting people under 18 restricts audience options; Meta may reject detailed targeting for them."));
  if (t.locales.length > 50) out.push(err(`${base}.locales`, "locales_max", "Meta allows at most 50 languages."));
  if (t.customAudiences.length > 500 || t.excludedCustomAudiences.length > 500) out.push(err(`${base}.customAudiences`, "audiences_max", "Meta allows at most 500 custom audiences included and 500 excluded."));
  if (t.detailed.length > 0 && places === 0 && t.customAudiences.length === 0) out.push(err(`${base}.detailed`, "detailed_needs_geo", "Detailed targeting needs a location or a custom audience."));
  if (specialCategories && (t.genders.length || t.detailed.length || g.zips.length)) out.push(warn(`${base}`, "special_restrictions", "Special ad categories restrict targeting (age, gender, postcode and detailed targeting); Meta may reject or ignore these."));
  const demo = [...t.detailed.flatMap((d) => d.demographics), ...t.excludedDetailed.demographics];
  for (const d of demo) if (!DEMOGRAPHIC_KINDS.includes(d.kind ?? "")) out.push(err(`${base}.detailed`, "demographic_kind", `"${d.name ?? d.id}" is missing its category; search it again.`));
  out.push(...validatePlacements(t.placements, goal, `${base}.placements`));
  return out;
}

function validateAdSet(s: MetaAdSetDraft, i: number, c: MetaCampaignDraft, account: MetaAccountFacts | null, now: Date): FieldError[] {
  const b = `meta.adSets[${i}]`;
  const out: FieldError[] = [];
  const rule = c.objective ? OBJECTIVE_RULES[c.objective] : null;
  if (!s.name.trim()) out.push(err(`${b}.name`, "name_required", "Give the ad set a name."));
  if (s.name.length > 400) out.push(err(`${b}.name`, "name_max", "An ad set name can be at most 400 characters."));
  if (!s.optimizationGoal) out.push(err(`${b}.optimizationGoal`, "goal_required", "Choose what the ad set optimises for."));
  else if (rule && !rule.goals.includes(s.optimizationGoal)) out.push(err(`${b}.optimizationGoal`, "goal_objective", `${s.optimizationGoal.replaceAll("_", " ").toLowerCase()} is not available for a ${META_OBJECTIVE_LABEL[c.objective!]} campaign.`));
  if (s.destinationType && rule?.destinations && !rule.destinations.includes(s.destinationType)) out.push(err(`${b}.destinationType`, "destination_objective", `${s.destinationType} is not available for a ${META_OBJECTIVE_LABEL[c.objective!]} campaign.`));
  if (s.destinationType && rule && rule.destinations === null) out.push(err(`${b}.destinationType`, "destination_unused", `A ${META_OBJECTIVE_LABEL[c.objective!]} campaign has no conversion location to choose.`));
  // promoted object
  const po = s.promotedObject;
  const need = s.optimizationGoal && rule ? rule.promoted[s.optimizationGoal] : undefined;
  if (need) {
    const keyMap = { page_id: po.pageId, pixel_id: po.pixelId, custom_event_type: po.customEventType, application_id: po.applicationId, object_store_url: po.objectStoreUrl, product_catalog_id: po.productCatalogId, product_set_id: po.productSetId, offer_id: po.offerId, event_id: po.eventId } as const;
    const ok = need.some((alt) => alt.every((k) => Boolean(keyMap[k])));
    if (!ok) {
      const first = need[0];
      const path = first[0] === "page_id" ? "pageId" : first[0] === "pixel_id" ? "pixelId" : first[0] === "application_id" ? "applicationId" : "customEventType";
      out.push(err(`${b}.promotedObject.${path}`, "promoted_required", `This goal needs ${need.map((alt) => alt.map((k) => k.replaceAll("_", " ")).join(" + ")).join(" or ")}.`));
    }
  }
  if (po.customEventType === "OTHER" && !po.customEventStr) out.push(err(`${b}.promotedObject.customEventStr`, "event_str", "Name the custom event."));
  // bidding
  const strategy = s.bidStrategy ?? c.bidStrategy;
  if (strategy && BID_AMOUNT_STRATEGIES.includes(strategy) && !(s.bidAmountMinor && s.bidAmountMinor > 0)) out.push(err(`${b}.bidAmountMinor`, "bid_required", "This bid strategy needs a bid amount."));
  if (strategy === "LOWEST_COST_WITH_MIN_ROAS") out.push(warn(`${b}.bidStrategy`, "roas_floor", "Minimum ROAS bidding also needs a ROAS floor, which this version does not send; Meta may reject it."));
  if (s.bidAmountMinor !== null && s.bidAmountMinor <= 0) out.push(err(`${b}.bidAmountMinor`, "bid_positive", "The bid must be above zero."));
  if (s.bidStrategy && c.bidStrategy && s.bidStrategy !== c.bidStrategy) out.push(warn(`${b}.bidStrategy`, "bid_both", "Set the bid strategy on the campaign or the ad set, not both."));
  // budget
  const cbo = c.campaignBudget !== null;
  if (cbo && s.budget) out.push(err(`${b}.budget`, "budget_both", "A budget is set on the campaign and on this ad set. Use one of them."));
  if (!cbo && !s.budget) out.push(err(`${b}.budget`, "budget_required", "Set a daily or lifetime budget."));
  const bud = s.budget;
  if (bud) {
    if (bud.type === "lifetime" && !s.endTime) out.push(err(`${b}.endTime`, "lifetime_end", "A lifetime budget needs an end date."));
    if (bud.type === "daily" && s.startTime && s.endTime && new Date(s.endTime).getTime() - new Date(s.startTime).getTime() <= 24 * 3600_000) out.push(err(`${b}.budget.type`, "daily_short", "A daily budget needs an ad set that runs for more than 24 hours."));
    if (bud.type === "daily" && account?.minDailyBudgetMinor && bud.amountMinor < account.minDailyBudgetMinor) out.push(err(`${b}.budget.amountMinor`, "budget_min", `The daily budget is below this ad account's minimum (${account.minDailyBudgetMinor / 100} ${account.currency}).`));
  }
  if (s.startTime && s.endTime && new Date(s.endTime) <= new Date(s.startTime)) out.push(err(`${b}.endTime`, "end_order", "The end is before the start."));
  if (s.endTime && new Date(s.endTime) <= now) out.push(err(`${b}.endTime`, "end_past", "The end date is in the past."));
  // attribution, frequency, dsa
  s.attribution.forEach((a, k) => {
    if (a.windowDays < 1 || a.windowDays > 90) out.push(err(`${b}.attribution[${k}].windowDays`, "attribution_window", "Attribution windows are 1 to 90 days; Meta accepts only certain windows per goal."));
  });
  if (s.frequencyControl) {
    const f = s.frequencyControl;
    if (s.optimizationGoal !== "REACH" && s.optimizationGoal !== "THRUPLAY") out.push(err(`${b}.frequencyControl`, "freq_goal", "Frequency caps only work with the Reach and ThruPlay goals."));
    if (f.intervalDays < 1 || f.intervalDays > 90 || f.maxFrequency < 1 || f.maxFrequency > 90) out.push(err(`${b}.frequencyControl`, "freq_range", "Frequency cap days and count must be 1 to 90."));
  }
  const euTarget = s.targeting.geo.countries.some((x) => (EU_COUNTRIES as readonly string[]).includes(x));
  if (euTarget) {
    if (!s.dsaBeneficiary.trim() && !account?.defaultDsaBeneficiary) out.push(err(`${b}.dsaBeneficiary`, "dsa_beneficiary", "Targeting the EU needs the beneficiary (who the ad is for)."));
    if (!s.dsaPayor.trim() && !account?.defaultDsaPayor) out.push(err(`${b}.dsaPayor`, "dsa_payor", "Targeting the EU needs the payor (who pays for the ad)."));
  }
  out.push(...validateTargeting(s.targeting, s.optimizationGoal, `${b}.targeting`, c.specialAdCategories.length > 0));
  return out;
}

function validateMedia(m: MediaFacts, base: string, placements: MetaTargetingDraft["placements"] | null): FieldError[] {
  const out: FieldError[] = [];
  if (m.kind === "image") {
    if (!/^image\/(jpeg|png)$/.test(m.contentType)) out.push(err(base, "image_type", "Meta ads take JPG or PNG images."));
    if (m.size > META_IMAGE_MAX_BYTES) out.push(err(base, "image_size", "Image ads can be at most 30 MB."));
    if (m.width && m.width < 600) out.push(warn(base, "image_width", "Meta recommends images at least 600 pixels wide (1440 x 1800 for 4:5)."));
  } else {
    if (m.size > META_VIDEO_MAX_BYTES) out.push(err(base, "video_size", "Video ads can be at most 4 GB."));
    if (m.durationSec !== null && m.durationSec > 120 && placements && !placements.automatic && (placements.facebookPositions.includes("story") || placements.instagramPositions.includes("story"))) out.push(err(base, "story_length", "Stories videos can be at most 120 seconds."));
    else if (m.durationSec !== null && m.durationSec > 60 && placements && !placements.automatic && (placements.facebookPositions.includes("story") || placements.instagramPositions.includes("story"))) out.push(warn(base, "story_length", "Meta's guides disagree on the Stories limit (60 or 120 seconds); over 60 seconds may be cut."));
  }
  if (m.width && m.height) {
    const vertical = ratioNear(m.width, m.height, 9 / 16);
    const feed = m.width / m.height >= 0.55 && m.width / m.height <= 1.92;
    const manual = placements && !placements.automatic ? placements : null;
    const wantsVertical = manual ? [...manual.instagramPositions, ...manual.facebookPositions].some((p) => ["story", "reels", "facebook_reels"].includes(p)) : false;
    if (wantsVertical && !vertical) out.push(warn(base, "ratio_vertical", "Stories and Reels look best at 9:16 (1080 x 1920)."));
    if (!feed) out.push(warn(base, "ratio_feed", "This shape is outside what Feed shows without cropping (4:5 to 1.91:1)."));
  }
  return out;
}

function validateAd(a: AdForValidation, c: MetaCampaignDraft, media: Map<string, MediaFacts>): FieldError[] {
  const b = `ads[${a.id}]`;
  const m = a.meta;
  const out: FieldError[] = [];
  const set = c.adSets.find((s) => s.key === m.adSetKey);
  if (!m.adSetKey) out.push(err(`${b}.meta.adSetKey`, "adset_required", "Choose which ad set this ad belongs to."));
  else if (!set) out.push(err(`${b}.meta.adSetKey`, "adset_unknown", "That ad set no longer exists."));
  if (!a.name.trim()) out.push(err(`${b}.name`, "name_required", "Give the ad a name."));
  if (!a.primaryText.trim()) out.push(err(`${b}.primaryText`, "primary_required", "Write the primary text."));
  if (!a.headline.trim() && m.creativeType !== "carousel") out.push(err(`${b}.headline`, "headline_required", "Write a headline."));
  if (a.primaryText.length > 125) out.push(warn(`${b}.primaryText`, "primary_long", "Only the first part of long primary text is shown before 'See more'."));
  if (a.headline.length > 40) out.push(warn(`${b}.headline`, "headline_long", "Headlines over about 40 characters are cut off in most placements."));
  const needsWeb = set?.destinationType === "WEBSITE" || (set && !set.destinationType && c.objective && ["OUTCOME_TRAFFIC", "OUTCOME_SALES"].includes(c.objective) && set.optimizationGoal !== "CONVERSATIONS");
  if (needsWeb && !m.link) out.push(err(`${b}.meta.link`, "link_required", "Add the website address people go to."));
  if (m.link && !https(m.link)) out.push(err(`${b}.meta.link`, "link_https", "The link must be a full https:// address."));
  if (m.link.length > 1000) out.push(err(`${b}.meta.link`, "link_max", "The link can be at most 1000 characters."));
  if (m.urlTags && /^[?&]/.test(m.urlTags)) out.push(err(`${b}.meta.urlTags`, "url_tags", "URL parameters are written without a leading ? or &, e.g. utm_source=meta&utm_medium=paid."));
  if (set?.promotedObject.pixelId && !m.conversionDomain) out.push(err(`${b}.meta.conversionDomain`, "conversion_domain", "Ads that share data with a pixel need the conversion domain (e.g. example.com)."));
  if (m.conversionDomain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(m.conversionDomain)) out.push(err(`${b}.meta.conversionDomain`, "conversion_domain_format", "Use only the domain, e.g. example.com."));
  if (m.ctaType && !(META_CTA_TYPES as readonly string[]).includes(m.ctaType)) out.push(err(`${b}.meta.ctaType`, "cta_unknown", "Choose a button from the list."));
  if (m.creativeType === "video" && !m.ctaType) out.push(warn(`${b}.meta.ctaType`, "cta_video", "Video ads normally carry a call to action button."));
  if (c.objective === "OUTCOME_LEADS" && set?.destinationType === "ON_AD" && !m.leadFormId) out.push(err(`${b}.meta.leadFormId`, "lead_form", "Instant-form lead ads need a lead form."));
  if (a.name.length > 100) out.push(warn(`${b}.name`, "creative_name", "The creative name is cut to 100 characters."));
  m.extraPrimaryTexts.forEach((t, i) => t.length > 2200 && out.push(err(`${b}.meta.extraPrimaryTexts[${i}]`, "text_max", "Primary text can be at most 2,200 characters.")));
  // media
  const placements = set?.targeting.placements ?? null;
  if (m.creativeType === "carousel") {
    if (m.cards.length < 2) out.push(err(`${b}.meta.cards`, "cards_min", "A carousel needs at least 2 cards."));
    if (m.cards.length > 10) out.push(err(`${b}.meta.cards`, "cards_max", "A carousel can have at most 10 cards."));
    m.cards.forEach((card, i) => {
      const f = media.get(card.mediaId);
      if (!f) out.push(err(`${b}.meta.cards[${i}].mediaId`, "media_missing", "That media item no longer exists."));
      else out.push(...validateMedia(f, `${b}.meta.cards[${i}].mediaId`, placements));
      if (!card.headline.trim()) out.push(err(`${b}.meta.cards[${i}].headline`, "card_headline", "Give every card a headline."));
      if (card.link && !https(card.link)) out.push(err(`${b}.meta.cards[${i}].link`, "link_https", "The link must be a full https:// address."));
    });
  } else {
    const wanted = m.creativeType === "video" ? "video" : "image";
    const files = a.mediaIds.map((id) => media.get(id)).filter((x): x is MediaFacts => Boolean(x));
    const first = files.find((f) => f.kind === wanted);
    if (!first) out.push(err(`${b}.mediaIds`, "media_required", `Attach ${wanted === "video" ? "a video" : "an image"} from the media library.`));
    else out.push(...validateMedia(first, `${b}.mediaIds`, placements));
    if (wanted === "video" && !files.some((f) => f.kind === "image")) out.push(warn(`${b}.mediaIds`, "thumbnail", "No thumbnail image attached; Meta will pick a frame."));
  }
  return out;
}

export function validateMetaLaunch(i: LaunchValidationInput): ValidationResult {
  const c = i.campaign;
  const now = i.now ?? new Date();
  const out: FieldError[] = [];
  if (!c.adAccountId) out.push(err("meta.adAccountId", "account_required", "Choose the Meta ad account to run this on."));
  if (!c.pageAccountId) out.push(err("meta.pageAccountId", "page_required", "Choose the Facebook Page the ads run as."));
  if (!c.objective) out.push(err("meta.objective", "objective_required", "Choose the campaign objective."));
  const a = i.account;
  if (c.adAccountId && !a) out.push(err("meta.adAccountId", "account_unreadable", "This ad account could not be read. Reconnect it in Settings > Connected accounts."));
  if (a && a.status !== null && a.status !== 1) out.push(err("meta.adAccountId", "account_status", `This ad account is not active (Meta status ${a.status}). Fix it in Meta Business settings first.`));
  for (const cc of c.specialAdCategoryCountry) if (!COUNTRY_RE.test(cc)) out.push(err("meta.specialAdCategoryCountry", "country_code", `"${cc}" is not a two-letter country code.`));
  if (c.specialAdCategories.length > 0 && c.specialAdCategoryCountry.length === 0) out.push(warn("meta.specialAdCategoryCountry", "sac_country", "Name the countries the special ad category applies to."));
  if (c.campaignBudget && c.adSets.some((s) => s.budget)) out.push(err("meta.campaignBudget", "budget_both", "A budget is set on the campaign and on an ad set. Use one of them."));
  if (c.spendCapMinor !== null) {
    if (c.spendCapMinor !== META_NO_CAP && a?.minSpendCapMinor && c.spendCapMinor < a.minSpendCapMinor) out.push(err("meta.spendCapMinor", "spend_cap_min", "The spend cap is below Meta's minimum for this account."));
  }
  if (c.campaignBudget && c.campaignBudget.type === "lifetime" && !c.stopTime) out.push(err("meta.stopTime", "lifetime_end", "A lifetime budget needs an end date."));
  if (c.campaignBudget && !c.bidStrategy) out.push(warn("meta.bidStrategy", "bid_strategy", "No bid strategy chosen; Meta will use lowest cost."));
  if (c.bidStrategy && BID_AMOUNT_STRATEGIES.includes(c.bidStrategy) && c.adSets.some((s) => !(s.bidAmountMinor && s.bidAmountMinor > 0))) out.push(err("meta.bidStrategy", "bid_required", "This bid strategy needs a bid amount on each ad set."));
  if (c.startTime && c.stopTime && new Date(c.stopTime) <= new Date(c.startTime)) out.push(err("meta.stopTime", "end_order", "The end is before the start."));
  if (c.adSets.length === 0) out.push(err("meta.adSets", "adset_required", "Add at least one ad set."));
  const keys = new Set<string>();
  c.adSets.forEach((s, idx) => {
    if (keys.has(s.key)) out.push(err(`meta.adSets[${idx}].key`, "adset_key", "Two ad sets share the same key."));
    keys.add(s.key);
    out.push(...validateAdSet(s, idx, c, a, now));
  });
  if (i.ads.length === 0) out.push(err("ads", "ad_required", "Add at least one ad."));
  const media = new Map(i.media.map((m) => [m.id, m]));
  for (const ad of i.ads) out.push(...validateAd(ad, c, media));
  for (const [idx, s] of c.adSets.entries()) if (!i.ads.some((ad) => ad.meta.adSetKey === s.key)) out.push(err(`meta.adSets[${idx}]`, "adset_empty", "This ad set has no ads."));
  if (c.adSets.some((s) => s.isDynamicCreative) && i.ads.filter((ad) => c.adSets.find((s) => s.key === ad.meta.adSetKey)?.isDynamicCreative).some((ad) => ad.meta.creativeType === "carousel")) out.push(err("ads", "dynamic_carousel", "Dynamic creative ad sets cannot hold carousel ads."));
  return result(out);
}
