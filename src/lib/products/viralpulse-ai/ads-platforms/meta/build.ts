import { META_NO_CAP, OBJECTIVE_RULES, billingEventFor, EU_COUNTRIES } from "./constants";
import type { MetaAdDraft, MetaAdSetDraft, MetaCampaignDraft, MetaPromotedObject, MetaTargetingDraft, TargetingRef } from "./draft";

/**
 * Pure request builders: draft -> the exact form fields Meta takes. Objects are returned as plain objects; the client JSON-encodes them.
 * Every object is created with status PAUSED (spend only starts at `activate`).
 */

const refList = (l: TargetingRef[]) => l.map((r) => ({ id: r.id, ...(r.name ? { name: r.name } : {}) }));

export function buildTargetingSpec(t: MetaTargetingDraft, euDsa = false): Record<string, unknown> {
  void euDsa;
  const g = t.geo;
  const geo: Record<string, unknown> = {};
  if (g.countries.length) geo.countries = g.countries;
  if (g.regions.length) geo.regions = g.regions.map((r) => ({ key: r.key }));
  if (g.cities.length) geo.cities = g.cities.map((c) => ({ key: c.key, ...(c.radius !== undefined ? { radius: c.radius, distance_unit: c.distanceUnit ?? "mile" } : {}) }));
  if (g.zips.length) geo.zips = g.zips.map((z) => ({ key: z.key }));
  const ex: Record<string, unknown> = {};
  if (g.excluded.countries.length) ex.countries = g.excluded.countries;
  if (g.excluded.regions.length) ex.regions = g.excluded.regions.map((r) => ({ key: r.key }));
  if (g.excluded.cities.length) ex.cities = g.excluded.cities.map((c) => ({ key: c.key }));
  if (g.excluded.zips.length) ex.zips = g.excluded.zips;
  const out: Record<string, unknown> = {};
  if (Object.keys(geo).length) out.geo_locations = geo;
  if (Object.keys(ex).length) out.excluded_geo_locations = ex;
  out.age_min = t.ageMin;
  out.age_max = t.ageMax;
  if (t.genders.length) out.genders = t.genders;
  if (t.locales.length) out.locales = t.locales;
  const group = (d: { interests: TargetingRef[]; behaviors: TargetingRef[]; demographics: TargetingRef[] }) => {
    const o: Record<string, unknown> = {};
    if (d.interests.length) o.interests = refList(d.interests);
    if (d.behaviors.length) o.behaviors = refList(d.behaviors);
    for (const r of d.demographics) {
      if (!r.kind) continue;
      const list = (o[r.kind] as unknown[] | undefined) ?? [];
      list.push({ id: r.id, ...(r.name ? { name: r.name } : {}) });
      o[r.kind] = list;
    }
    return o;
  };
  const flex = t.detailed.map(group).filter((o) => Object.keys(o).length);
  if (flex.length) out.flexible_spec = flex;
  const exclusions = group(t.excludedDetailed);
  if (Object.keys(exclusions).length) out.exclusions = exclusions;
  if (t.customAudiences.length) out.custom_audiences = t.customAudiences.map((a) => ({ id: a.id }));
  if (t.excludedCustomAudiences.length) out.excluded_custom_audiences = t.excludedCustomAudiences.map((a) => ({ id: a.id }));
  out.targeting_automation = { advantage_audience: t.advantageAudience ? 1 : 0 };
  const p = t.placements;
  if (!p.automatic) {
    if (p.publisherPlatforms.length) out.publisher_platforms = p.publisherPlatforms;
    if (p.facebookPositions.length) out.facebook_positions = p.facebookPositions;
    if (p.instagramPositions.length) out.instagram_positions = p.instagramPositions;
    if (p.messengerPositions.length) out.messenger_positions = p.messengerPositions;
    if (p.audienceNetworkPositions.length) out.audience_network_positions = p.audienceNetworkPositions;
    if (p.devicePlatforms.length) out.device_platforms = p.devicePlatforms;
  }
  return out;
}

export function buildPromotedObject(p: MetaPromotedObject): Record<string, unknown> | undefined {
  const o: Record<string, unknown> = {};
  if (p.pageId) o.page_id = p.pageId;
  if (p.pixelId) o.pixel_id = p.pixelId;
  if (p.customEventType) o.custom_event_type = p.customEventType;
  if (p.customEventStr) o.custom_event_str = p.customEventStr;
  if (p.applicationId) o.application_id = p.applicationId;
  if (p.objectStoreUrl) o.object_store_url = p.objectStoreUrl;
  if (p.productCatalogId) o.product_catalog_id = p.productCatalogId;
  if (p.productSetId) o.product_set_id = p.productSetId;
  if (p.offerId) o.offer_id = p.offerId;
  if (p.eventId) o.event_id = p.eventId;
  return Object.keys(o).length ? o : undefined;
}

export function buildCampaignPayload(c: MetaCampaignDraft, name: string): Record<string, unknown> {
  const o: Record<string, unknown> = {
    name,
    objective: c.objective,
    status: "PAUSED",
    special_ad_categories: c.specialAdCategories.length ? c.specialAdCategories : ["NONE"],
    buying_type: "AUCTION",
  };
  if (c.specialAdCategories.length && c.specialAdCategoryCountry.length) o.special_ad_category_country = c.specialAdCategoryCountry;
  if (c.campaignBudget) {
    o[c.campaignBudget.type === "daily" ? "daily_budget" : "lifetime_budget"] = c.campaignBudget.amountMinor;
    o.bid_strategy = c.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP";
  } else {
    o.is_adset_budget_sharing_enabled = false;
  }
  if (c.spendCapMinor !== null) o.spend_cap = c.spendCapMinor;
  if (c.startTime) o.start_time = c.startTime;
  if (c.stopTime) o.stop_time = c.stopTime;
  return o;
}

export function buildAdSetPayload(s: MetaAdSetDraft, c: MetaCampaignDraft, campaignExtId: string, pageId: string, accountDefaults: { dsaPayor?: string | null; dsaBeneficiary?: string | null } = {}): Record<string, unknown> {
  const o: Record<string, unknown> = {
    name: s.name,
    campaign_id: campaignExtId,
    status: "PAUSED",
    optimization_goal: s.optimizationGoal,
    billing_event: s.billingEvent ?? billingEventFor(s.optimizationGoal!),
    targeting: buildTargetingSpec(s.targeting),
  };
  if (!c.campaignBudget && s.budget) o[s.budget.type === "daily" ? "daily_budget" : "lifetime_budget"] = s.budget.amountMinor;
  const strategy = s.bidStrategy ?? (c.campaignBudget ? undefined : c.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP");
  if (strategy && !c.campaignBudget) o.bid_strategy = strategy;
  if (s.bidAmountMinor && (strategy === "LOWEST_COST_WITH_BID_CAP" || strategy === "COST_CAP" || c.bidStrategy === "LOWEST_COST_WITH_BID_CAP" || c.bidStrategy === "COST_CAP")) o.bid_amount = s.bidAmountMinor;
  o.start_time = s.startTime ?? c.startTime ?? undefined;
  const end = s.endTime ?? (s.budget?.type === "lifetime" ? c.stopTime : null);
  if (end) o.end_time = end;
  if (s.destinationType) o.destination_type = s.destinationType;
  const po = { ...s.promotedObject };
  const needs = c.objective && s.optimizationGoal ? OBJECTIVE_RULES[c.objective].promoted[s.optimizationGoal] : undefined;
  if (!po.pageId && needs?.some((alt) => alt.includes("page_id"))) po.pageId = pageId;
  const pob = buildPromotedObject(po);
  if (pob) o.promoted_object = pob;
  if (s.attribution.length) o.attribution_spec = s.attribution.map((a) => ({ event_type: a.eventType, window_days: a.windowDays }));
  const eu = s.targeting.geo.countries.some((x) => (EU_COUNTRIES as readonly string[]).includes(x));
  if (eu) {
    const ben = s.dsaBeneficiary || accountDefaults.dsaBeneficiary;
    const pay = s.dsaPayor || accountDefaults.dsaPayor;
    if (ben) o.dsa_beneficiary = ben;
    if (pay) o.dsa_payor = pay;
  }
  if (s.isDynamicCreative) o.is_dynamic_creative = true;
  if (s.frequencyControl) o.frequency_control_specs = [{ event: s.frequencyControl.event, interval_days: s.frequencyControl.intervalDays, max_frequency: s.frequencyControl.maxFrequency }];
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

export interface CreativeAssets {
  /** media id -> Meta image hash */
  imageHashes: Record<string, string>;
  /** media id -> Meta video id */
  videoIds: Record<string, string>;
}

export interface CreativeInput {
  name: string;
  headline: string;
  primaryText: string;
  description: string;
  mediaIds: string[];
  /** Kind of each media id, to pick the main file and the thumbnail. */
  mediaKinds: Record<string, "image" | "video">;
  meta: MetaAdDraft;
  pageId: string;
  instagramUserId: string | null;
}

function cta(m: MetaAdDraft, link: string) {
  if (!m.ctaType) return undefined;
  if (m.ctaType === "NO_BUTTON") return { type: "NO_BUTTON" };
  const value: Record<string, unknown> = {};
  if (m.leadFormId) value.lead_gen_form_id = m.leadFormId;
  else if (link) value.link = link;
  return { type: m.ctaType, ...(Object.keys(value).length ? { value } : {}) };
}

export function buildCreativePayload(i: CreativeInput, a: CreativeAssets): Record<string, unknown> {
  const m = i.meta;
  const spec: Record<string, unknown> = { page_id: i.pageId };
  if (i.instagramUserId) spec.instagram_user_id = i.instagramUserId;
  const out: Record<string, unknown> = { name: i.name.slice(0, 100) };
  const firstOf = (k: "image" | "video") => i.mediaIds.find((id) => i.mediaKinds[id] === k);
  const link = m.link;
  const hasExtras = m.extraPrimaryTexts.length > 0 || m.extraHeadlines.length > 0;
  if (hasExtras && m.creativeType !== "carousel") {
    const img = firstOf("image");
    const vid = firstOf("video");
    const asset: Record<string, unknown> = {
      bodies: [i.primaryText, ...m.extraPrimaryTexts].map((text) => ({ text })),
      titles: [i.headline, ...m.extraHeadlines].filter(Boolean).map((text) => ({ text })),
      link_urls: [{ website_url: link, ...(m.displayLink ? { display_url: m.displayLink } : {}) }],
      ad_formats: [m.creativeType === "video" ? "SINGLE_VIDEO" : "SINGLE_IMAGE"],
    };
    if (i.description) asset.descriptions = [{ text: i.description }];
    if (m.creativeType === "video" && vid) asset.videos = [{ video_id: a.videoIds[vid], ...(img ? { thumbnail_hash: a.imageHashes[img] } : {}) }];
    else if (img) asset.images = [{ hash: a.imageHashes[img] }];
    if (m.ctaType && m.ctaType !== "NO_BUTTON") asset.call_to_action_types = [m.ctaType];
    out.asset_feed_spec = asset;
  } else if (m.creativeType === "carousel") {
    spec.link_data = {
      link,
      message: i.primaryText,
      ...(m.displayLink ? { caption: m.displayLink } : {}),
      child_attachments: m.cards.map((c) => ({
        link: c.link || link,
        name: c.headline,
        ...(c.description ? { description: c.description } : {}),
        ...(i.mediaKinds[c.mediaId] === "video" ? { video_id: a.videoIds[c.mediaId] } : { image_hash: a.imageHashes[c.mediaId] }),
        ...(cta(m, c.link || link) ? { call_to_action: cta(m, c.link || link) } : {}),
      })),
      ...(cta(m, link) ? { call_to_action: cta(m, link) } : {}),
    };
  } else if (m.creativeType === "video") {
    const vid = firstOf("video")!;
    const img = firstOf("image");
    spec.video_data = {
      video_id: a.videoIds[vid],
      message: i.primaryText,
      ...(i.headline ? { title: i.headline } : {}),
      ...(i.description ? { link_description: i.description } : {}),
      ...(img ? { image_hash: a.imageHashes[img] } : {}),
      ...(cta(m, link) ? { call_to_action: cta(m, link) } : {}),
    };
  } else {
    const img = firstOf("image")!;
    spec.link_data = {
      link,
      message: i.primaryText,
      image_hash: a.imageHashes[img],
      ...(i.headline ? { name: i.headline } : {}),
      ...(i.description ? { description: i.description } : {}),
      ...(m.displayLink ? { caption: m.displayLink } : {}),
      ...(cta(m, link) ? { call_to_action: cta(m, link) } : {}),
    };
  }
  out.object_story_spec = spec;
  if (m.urlTags) out.url_tags = m.urlTags;
  if (m.politicalDeclaration === "political") out.authorization_category = "POLITICAL";
  if (m.politicalDeclaration === "political_digital") out.authorization_category = "POLITICAL_WITH_DIGITALLY_CREATED_MEDIA";
  return out;
}

export function buildAdPayload(name: string, adSetExtId: string, creativeExtId: string, m: MetaAdDraft): Record<string, unknown> {
  return {
    name,
    adset_id: adSetExtId,
    creative: { creative_id: creativeExtId },
    status: "PAUSED",
    ...(m.conversionDomain ? { conversion_domain: m.conversionDomain } : {}),
  };
}

/** The status write for activate / pause / archive. */
export const statusPayload = (s: "ACTIVE" | "PAUSED" | "ARCHIVED" | "DELETED") => ({ status: s });
export { META_NO_CAP };
