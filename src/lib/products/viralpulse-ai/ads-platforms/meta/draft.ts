import { META_OBJECTIVES, META_SPECIAL_AD_CATEGORIES, META_BID_STRATEGIES, META_OPTIMIZATION_GOALS, META_DESTINATION_TYPES, META_BILLING_EVENTS, ctaFromText, billingEventFor, type MetaObjective, type MetaSpecialAdCategory, type MetaBidStrategy, type MetaOptimizationGoal, type MetaDestinationType, type MetaBillingEvent, type MetaCtaType } from "./constants";

/**
 * The editable draft of a Meta launch. It lives on the campaign (`campaign.paid.meta`) and on each ad (`ad.paid.meta`), schema version 2.
 * Version 1 (no `paid` field) is a campaign/ad that only holds copy; `normalizeCampaignPaid` / `normalizeAdPaid` lift it. All money is an
 * integer in the ad account's currency minor unit (e.g. paise, cents), exactly what Meta takes. Pure: safe in client components.
 */

export const PAID_SCHEMA_VERSION = 2;

export interface MinorMoney {
  type: "daily" | "lifetime";
  amountMinor: number;
}

export interface MetaGeo {
  countries: string[];
  regions: { key: string; name?: string }[];
  cities: { key: string; name?: string; radius?: number; distanceUnit?: "kilometer" | "mile" }[];
  zips: { key: string }[];
  excluded: { countries: string[]; regions: { key: string; name?: string }[]; cities: { key: string; name?: string }[]; zips: { key: string }[] };
}

export interface TargetingRef {
  id: string;
  name?: string;
  /** Demographics only: the targeting key the item belongs under (life_events, industries, income, family_statuses). */
  kind?: string;
}

export interface MetaTargetingDraft {
  geo: MetaGeo;
  ageMin: number;
  ageMax: number;
  /** [] = all genders. */
  genders: (1 | 2)[];
  locales: number[];
  /** Detailed targeting: each group is ANDed, items inside a group are ORed (Meta flexible_spec). */
  detailed: { interests: TargetingRef[]; behaviors: TargetingRef[]; demographics: TargetingRef[] }[];
  excludedDetailed: { interests: TargetingRef[]; behaviors: TargetingRef[]; demographics: TargetingRef[] };
  customAudiences: TargetingRef[];
  excludedCustomAudiences: TargetingRef[];
  /** Advantage+ audience. */
  advantageAudience: boolean;
  placements: {
    /** true = Advantage+ placements (nothing sent). */
    automatic: boolean;
    publisherPlatforms: string[];
    facebookPositions: string[];
    instagramPositions: string[];
    messengerPositions: string[];
    audienceNetworkPositions: string[];
    devicePlatforms: string[];
  };
}

export interface MetaPromotedObject {
  pageId?: string;
  pixelId?: string;
  customEventType?: string;
  customEventStr?: string;
  applicationId?: string;
  objectStoreUrl?: string;
  productCatalogId?: string;
  productSetId?: string;
  offerId?: string;
  eventId?: string;
}

export interface MetaAdSetDraft {
  /** Stable key ads refer to (not the Meta id). */
  key: string;
  name: string;
  optimizationGoal: MetaOptimizationGoal | null;
  billingEvent: MetaBillingEvent | null;
  bidStrategy: MetaBidStrategy | null;
  bidAmountMinor: number | null;
  /** null when the budget is on the campaign. */
  budget: MinorMoney | null;
  startTime: string | null;
  endTime: string | null;
  destinationType: MetaDestinationType | null;
  promotedObject: MetaPromotedObject;
  targeting: MetaTargetingDraft;
  attribution: { eventType: "CLICK_THROUGH" | "VIEW_THROUGH" | "ENGAGED_VIDEO_VIEW"; windowDays: number }[];
  dsaBeneficiary: string;
  dsaPayor: string;
  isDynamicCreative: boolean;
  frequencyControl: { event: "IMPRESSIONS" | "VIDEO_VIEWS" | "VIDEO_VIEWS_2S" | "VIDEO_VIEWS_15S"; intervalDays: number; maxFrequency: number } | null;
}

export interface MetaCampaignDraft {
  /** `smms_accounts` ids. */
  adAccountId: string | null;
  pageAccountId: string | null;
  instagramAccountId: string | null;
  objective: MetaObjective | null;
  /** [] = NONE. */
  specialAdCategories: MetaSpecialAdCategory[];
  specialAdCategoryCountry: string[];
  bidStrategy: MetaBidStrategy | null;
  spendCapMinor: number | null;
  /** Campaign budget (CBO). null = budgets live on the ad sets. */
  campaignBudget: MinorMoney | null;
  startTime: string | null;
  stopTime: string | null;
  adSets: MetaAdSetDraft[];
}

export interface CampaignPaid {
  schemaVersion: number;
  meta: MetaCampaignDraft;
}

export type MetaCreativeType = "image" | "video" | "carousel";

export interface MetaAdDraft {
  adSetKey: string | null;
  creativeType: MetaCreativeType;
  link: string;
  /** Shown instead of the full URL (link_data.caption). */
  displayLink: string;
  ctaType: MetaCtaType | null;
  /** Lead form id for lead-form ads. */
  leadFormId: string;
  urlTags: string;
  conversionDomain: string;
  /** Carousel cards, in order. Each uses a media library item. */
  cards: { mediaId: string; headline: string; description: string; link: string }[];
  /** Extra variants Meta rotates (asset_feed_spec). Empty = single text/headline. */
  extraPrimaryTexts: string[];
  extraHeadlines: string[];
  /** Political / digitally-created-media declaration (creative authorization_category). */
  politicalDeclaration: "none" | "political" | "political_digital";
}

export interface AdPaid {
  schemaVersion: number;
  meta: MetaAdDraft;
}

export const emptyGeo = (): MetaGeo => ({ countries: [], regions: [], cities: [], zips: [], excluded: { countries: [], regions: [], cities: [], zips: [] } });
export const emptyTargeting = (): MetaTargetingDraft => ({
  geo: emptyGeo(), ageMin: 18, ageMax: 65, genders: [], locales: [], detailed: [], excludedDetailed: { interests: [], behaviors: [], demographics: [] }, customAudiences: [], excludedCustomAudiences: [], advantageAudience: false,
  placements: { automatic: true, publisherPlatforms: [], facebookPositions: [], instagramPositions: [], messengerPositions: [], audienceNetworkPositions: [], devicePlatforms: [] },
});
export const emptyAdSet = (key: string, name: string): MetaAdSetDraft => ({
  key, name, optimizationGoal: null, billingEvent: null, bidStrategy: null, bidAmountMinor: null, budget: null, startTime: null, endTime: null, destinationType: null, promotedObject: {}, targeting: emptyTargeting(),
  attribution: [], dsaBeneficiary: "", dsaPayor: "", isDynamicCreative: false, frequencyControl: null,
});
export const emptyMetaCampaign = (): MetaCampaignDraft => ({
  adAccountId: null, pageAccountId: null, instagramAccountId: null, objective: null, specialAdCategories: [], specialAdCategoryCountry: [], bidStrategy: null, spendCapMinor: null, campaignBudget: null, startTime: null, stopTime: null, adSets: [],
});
export const emptyMetaAd = (): MetaAdDraft => ({
  adSetKey: null, creativeType: "image", link: "", displayLink: "", ctaType: null, leadFormId: "", urlTags: "", conversionDomain: "", cards: [], extraPrimaryTexts: [], extraHeadlines: [], politicalDeclaration: "none",
});

// ── tolerant normalisers (anything that comes from the database or a form passes through these) ──
type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const s = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const int = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null);
const strs = (v: unknown, max = 100) => [...new Set(arr(v).map((x) => s(x, 80)).filter(Boolean))].slice(0, max);
const isoOrNull = (v: unknown): string | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === "string" && v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
};
const refs = (v: unknown): TargetingRef[] => arr(v).map((x) => ({ id: s(rec(x).id, 40), name: s(rec(x).name, 200) || undefined, kind: s(rec(x).kind, 40) || undefined })).filter((x) => x.id).slice(0, 500);
const money = (v: unknown): MinorMoney | null => {
  const r = rec(v);
  const type = r.type === "lifetime" ? "lifetime" : r.type === "daily" ? "daily" : null;
  const amount = int(r.amountMinor);
  return type && amount !== null && amount > 0 ? { type, amountMinor: amount } : null;
};
const keyed = (v: unknown) => arr(v).map((x) => ({ key: s(rec(x).key, 60), name: s(rec(x).name, 200) || undefined })).filter((x) => x.key);

export function normalizeTargeting(v: unknown): MetaTargetingDraft {
  const r = rec(v);
  const g = rec(r.geo);
  const ex = rec(g.excluded);
  const p = rec(r.placements);
  const base = emptyTargeting();
  const grp = (x: unknown) => ({ interests: refs(rec(x).interests), behaviors: refs(rec(x).behaviors), demographics: refs(rec(x).demographics) });
  return {
    geo: {
      countries: strs(g.countries).map((c) => c.toUpperCase()),
      regions: keyed(g.regions),
      cities: arr(g.cities).map((x) => {
        const c = rec(x);
        return { key: s(c.key, 60), name: s(c.name, 200) || undefined, radius: int(c.radius) ?? undefined, distanceUnit: c.distanceUnit === "mile" ? ("mile" as const) : c.distanceUnit === "kilometer" ? ("kilometer" as const) : undefined };
      }).filter((c) => c.key),
      zips: keyed(g.zips).map((z) => ({ key: z.key })),
      excluded: { countries: strs(ex.countries).map((c) => c.toUpperCase()), regions: keyed(ex.regions), cities: keyed(ex.cities), zips: keyed(ex.zips).map((z) => ({ key: z.key })) },
    },
    ageMin: int(r.ageMin) ?? base.ageMin,
    ageMax: int(r.ageMax) ?? base.ageMax,
    genders: arr(r.genders).filter((x): x is 1 | 2 => x === 1 || x === 2),
    locales: arr(r.locales).map(int).filter((x): x is number => x !== null).slice(0, 50),
    detailed: arr(r.detailed).map(grp).filter((x) => x.interests.length + x.behaviors.length + x.demographics.length > 0),
    excludedDetailed: grp(r.excludedDetailed),
    customAudiences: refs(r.customAudiences),
    excludedCustomAudiences: refs(r.excludedCustomAudiences),
    advantageAudience: r.advantageAudience === true,
    placements: {
      automatic: p.automatic === false ? false : true,
      publisherPlatforms: strs(p.publisherPlatforms),
      facebookPositions: strs(p.facebookPositions),
      instagramPositions: strs(p.instagramPositions),
      messengerPositions: strs(p.messengerPositions),
      audienceNetworkPositions: strs(p.audienceNetworkPositions),
      devicePlatforms: strs(p.devicePlatforms),
    },
  };
}

export function normalizeAdSet(v: unknown, i = 0): MetaAdSetDraft {
  const r = rec(v);
  const po = rec(r.promotedObject);
  const fc = rec(r.frequencyControl);
  const fcEvent = oneOf(fc.event, ["IMPRESSIONS", "VIDEO_VIEWS", "VIDEO_VIEWS_2S", "VIDEO_VIEWS_15S"] as const);
  return {
    key: s(r.key, 40) || `set${i + 1}`,
    name: s(r.name, 400),
    optimizationGoal: oneOf(r.optimizationGoal, META_OPTIMIZATION_GOALS),
    billingEvent: oneOf(r.billingEvent, META_BILLING_EVENTS),
    bidStrategy: oneOf(r.bidStrategy, META_BID_STRATEGIES),
    bidAmountMinor: int(r.bidAmountMinor),
    budget: money(r.budget),
    startTime: isoOrNull(r.startTime),
    endTime: isoOrNull(r.endTime),
    destinationType: oneOf(r.destinationType, META_DESTINATION_TYPES),
    promotedObject: Object.fromEntries(
      (["pageId", "pixelId", "customEventType", "customEventStr", "applicationId", "objectStoreUrl", "productCatalogId", "productSetId", "offerId", "eventId"] as const).map((k) => [k, s(po[k], 300)]).filter(([, x]) => x),
    ) as MetaPromotedObject,
    targeting: normalizeTargeting(r.targeting),
    attribution: arr(r.attribution).map((x) => ({ eventType: oneOf(rec(x).eventType, ["CLICK_THROUGH", "VIEW_THROUGH", "ENGAGED_VIDEO_VIEW"] as const), windowDays: int(rec(x).windowDays) ?? 0 })).filter((x): x is MetaAdSetDraft["attribution"][number] => x.eventType !== null && x.windowDays > 0),
    dsaBeneficiary: s(r.dsaBeneficiary, 512),
    dsaPayor: s(r.dsaPayor, 512),
    isDynamicCreative: r.isDynamicCreative === true,
    frequencyControl: fcEvent && int(fc.intervalDays) && int(fc.maxFrequency) ? { event: fcEvent, intervalDays: int(fc.intervalDays)!, maxFrequency: int(fc.maxFrequency)! } : null,
  };
}

export function normalizeMetaCampaign(v: unknown): MetaCampaignDraft {
  const r = rec(v);
  return {
    adAccountId: s(r.adAccountId, 64) || null,
    pageAccountId: s(r.pageAccountId, 64) || null,
    instagramAccountId: s(r.instagramAccountId, 64) || null,
    objective: oneOf(r.objective, META_OBJECTIVES),
    specialAdCategories: arr(r.specialAdCategories).filter((x): x is MetaSpecialAdCategory => (META_SPECIAL_AD_CATEGORIES as readonly unknown[]).includes(x)),
    specialAdCategoryCountry: strs(r.specialAdCategoryCountry).map((c) => c.toUpperCase()),
    bidStrategy: oneOf(r.bidStrategy, META_BID_STRATEGIES),
    spendCapMinor: int(r.spendCapMinor) && int(r.spendCapMinor)! > 0 ? int(r.spendCapMinor) : null,
    campaignBudget: money(r.campaignBudget),
    startTime: isoOrNull(r.startTime),
    stopTime: isoOrNull(r.stopTime),
    adSets: arr(r.adSets).slice(0, 20).map(normalizeAdSet),
  };
}

export function normalizeMetaAd(v: unknown): MetaAdDraft {
  const r = rec(v);
  const base = emptyMetaAd();
  return {
    adSetKey: s(r.adSetKey, 40) || null,
    creativeType: oneOf(r.creativeType, ["image", "video", "carousel"] as const) ?? base.creativeType,
    link: s(r.link, 1000),
    displayLink: s(r.displayLink, 200),
    ctaType: typeof r.ctaType === "string" ? ctaFromText(r.ctaType) : null,
    leadFormId: s(r.leadFormId, 40),
    urlTags: s(r.urlTags, 1000),
    conversionDomain: s(r.conversionDomain, 255),
    cards: arr(r.cards).map((x) => ({ mediaId: s(rec(x).mediaId, 64), headline: s(rec(x).headline, 200), description: s(rec(x).description, 300), link: s(rec(x).link, 1000) })).filter((c) => c.mediaId).slice(0, 10),
    extraPrimaryTexts: arr(r.extraPrimaryTexts).map((x) => s(x, 2200)).filter(Boolean).slice(0, 4),
    extraHeadlines: arr(r.extraHeadlines).map((x) => s(x, 200)).filter(Boolean).slice(0, 4),
    politicalDeclaration: r.politicalDeclaration === "political" || r.politicalDeclaration === "political_digital" ? r.politicalDeclaration : "none",
  };
}

/** Objective words used in the old free-text brief -> API objective. Only unambiguous phrases map; anything else stays unset so the person picks. */
export function objectiveFromText(text: string): MetaObjective | null {
  const t = text.toLowerCase();
  const hits: MetaObjective[] = [];
  if (/\b(lead|leads|lead generation|enquir|inquir|sign.?up)/.test(t)) hits.push("OUTCOME_LEADS");
  if (/\b(sales|purchase|conversion|revenue|e-?commerce)/.test(t)) hits.push("OUTCOME_SALES");
  if (/\b(traffic|website visit|clicks?)\b/.test(t)) hits.push("OUTCOME_TRAFFIC");
  if (/\b(awareness|reach|brand)\b/.test(t)) hits.push("OUTCOME_AWARENESS");
  if (/\b(engagement|followers|likes)\b/.test(t)) hits.push("OUTCOME_ENGAGEMENT");
  if (/\b(app install|app promotion)\b/.test(t)) hits.push("OUTCOME_APP_PROMOTION");
  return hits.length === 1 ? hits[0] : null;
}

/** Subset of the campaign brief the migration reads. */
export interface LegacyBrief {
  objective?: string;
  budget?: number | null;
  currency?: string;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  location?: string;
  name?: string;
  landingPage?: string;
  cta?: string;
}

/**
 * Lifts a campaign to schema version 2. A campaign that only holds copy gets an empty draft plus what the brief states unambiguously
 * (objective words, start/end dates). It never invents an account, audience or budget. Idempotent: version 2 passes through normalised.
 */
export function normalizeCampaignPaid(paid: unknown, brief: LegacyBrief = {}): CampaignPaid {
  const r = rec(paid);
  if (r.schemaVersion === PAID_SCHEMA_VERSION) return { schemaVersion: PAID_SCHEMA_VERSION, meta: normalizeMetaCampaign(r.meta) };
  const m = emptyMetaCampaign();
  m.objective = objectiveFromText(brief.objective ?? "");
  m.startTime = isoOrNull(brief.startDate);
  m.stopTime = isoOrNull(brief.endDate);
  return { schemaVersion: PAID_SCHEMA_VERSION, meta: m };
}

export function normalizeAdPaid(paid: unknown, legacy: { cta?: string; landingPage?: string; format?: "image" | "video" } = {}): AdPaid {
  const r = rec(paid);
  if (r.schemaVersion === PAID_SCHEMA_VERSION) return { schemaVersion: PAID_SCHEMA_VERSION, meta: normalizeMetaAd(r.meta) };
  const m = emptyMetaAd();
  m.creativeType = legacy.format === "video" ? "video" : "image";
  m.ctaType = legacy.cta ? ctaFromText(legacy.cta) : null;
  m.link = legacy.landingPage && /^https:\/\//i.test(legacy.landingPage) ? legacy.landingPage : "";
  return { schemaVersion: PAID_SCHEMA_VERSION, meta: m };
}

export const defaultBilling = (goal: MetaOptimizationGoal | null): MetaBillingEvent | null => (goal ? billingEventFor(goal) : null);
