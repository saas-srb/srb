/**
 * Pure helpers behind the Campaigns & Ads wizard and list (no server-only imports: safe in client components and in tests).
 * Everything here derives from the verified vocabulary in `meta/constants.ts` and the validator in `meta/validate.ts`; it adds
 * no facts of its own. Where SPEC.md states the objective -> destination -> goal table (section 1.3) it is encoded in DESTINATION_GOALS.
 */
import {
  OBJECTIVE_RULES, META_OBJECTIVES, META_OBJECTIVE_LABEL, billingEventFor, EU_COUNTRIES,
  type MetaObjective, type MetaDestinationType, type MetaOptimizationGoal, type PromotedKey,
} from "./meta/constants";
import { validatePlacements } from "./meta/validate";
import {
  emptyAdSet, emptyMetaAd, emptyMetaCampaign, emptyTargeting,
  type MetaAdDraft, type MetaAdSetDraft, type MetaCampaignDraft, type MetaTargetingDraft,
} from "./meta/draft";
import { currencyDigits, ADS_PLATFORMS, type AdsPlatformKey, type FieldError } from "./types";
import type { GoogleSearchCampaignDraft } from "./google";
import type { LinkedInCampaignDraft, LinkedInCampaignGroupDraft } from "./linkedin";
import type { XCampaignDraft } from "./x";

// ── steps ───────────────────────────────────────────────────────────────────────────────────────────

export const WIZARD_STEPS = [
  { key: "account", label: "Platform & account" },
  { key: "campaign", label: "Objective & campaign" },
  { key: "adsets", label: "Ad sets" },
  { key: "ads", label: "Ads" },
  { key: "review", label: "Review & launch" },
] as const;
export type WizardStepKey = (typeof WIZARD_STEPS)[number]["key"];
export const isStepKey = (v: unknown): v is WizardStepKey => WIZARD_STEPS.some((s) => s.key === v);

// ── money (always integers in the currency's minor unit) ───────────────────────────────────────────

/** "1,500.50 INR" style text from minor units. Uses the currency's real digit count (JPY 0, INR 2, KWD 3). */
export function formatMinor(minor: number | null | undefined, currency: string, locale = "en-IN"): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return "-";
  const digits = currencyDigits(currency);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 10 ** digits);
  } catch {
    return `${(minor / 10 ** digits).toFixed(digits)} ${currency}`;
  }
}

/** Text a person typed ("1500", "1,500.50") -> minor units, or null when it is not a positive amount. Never rounds more digits than the currency has silently: extra digits are rejected. */
export function parseMajorToMinor(text: string, currency: string): number | null {
  const t = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const digits = currencyDigits(currency);
  const [whole, frac = ""] = t.split(".");
  if (frac.length > digits) return null;
  const minor = Number(whole) * 10 ** digits + Number((frac + "0".repeat(digits)).slice(0, digits) || 0);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

/** The number to show in an input for a stored minor amount. */
export function minorToInput(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "";
  const digits = currencyDigits(currency);
  return digits === 0 ? String(minor) : (minor / 10 ** digits).toFixed(digits).replace(/\.0+$/, "");
}

// ── objective / destination / goal ─────────────────────────────────────────────────────────────────

export const OBJECTIVE_INFO: Record<MetaObjective, { label: string; description: string }> = {
  OUTCOME_AWARENESS: { label: META_OBJECTIVE_LABEL.OUTCOME_AWARENESS, description: "Show your ads to the people most likely to remember them. Choose this to be seen, not to get a click." },
  OUTCOME_TRAFFIC: { label: META_OBJECTIVE_LABEL.OUTCOME_TRAFFIC, description: "Send people to a website, an app or a Messenger or WhatsApp chat." },
  OUTCOME_ENGAGEMENT: { label: META_OBJECTIVE_LABEL.OUTCOME_ENGAGEMENT, description: "Get more messages, video views, post reactions or Page likes." },
  OUTCOME_LEADS: { label: META_OBJECTIVE_LABEL.OUTCOME_LEADS, description: "Collect enquiries with a form inside Facebook or Instagram, a website conversion or a chat." },
  OUTCOME_APP_PROMOTION: { label: META_OBJECTIVE_LABEL.OUTCOME_APP_PROMOTION, description: "Get people to install your app or take an action inside it." },
  OUTCOME_SALES: { label: META_OBJECTIVE_LABEL.OUTCOME_SALES, description: "Find people likely to buy or complete a valuable action on your website or app." },
};
export const OBJECTIVE_OPTIONS = META_OBJECTIVES.map((o) => ({ value: o, ...OBJECTIVE_INFO[o] }));

export const DESTINATION_LABEL: Partial<Record<MetaDestinationType, { label: string; description: string }>> = {
  WEBSITE: { label: "Website", description: "People land on your website." },
  APP: { label: "App", description: "People open or install your app." },
  MESSENGER: { label: "Messenger", description: "People start a chat with your Page in Messenger." },
  WHATSAPP: { label: "WhatsApp", description: "People start a WhatsApp chat." },
  INSTAGRAM_DIRECT: { label: "Instagram messages", description: "People message your Instagram account." },
  ON_AD: { label: "Instant form on the ad", description: "People fill in a lead form without leaving Facebook or Instagram." },
  ON_POST: { label: "Your post", description: "People react to, comment on or share the post." },
  ON_PAGE: { label: "Your Facebook Page", description: "People like or visit your Page." },
  ON_EVENT: { label: "Your event", description: "People respond to your Facebook event." },
  ON_VIDEO: { label: "Your video", description: "People watch your video on Facebook or Instagram." },
};

/** Goals Meta documents for each (objective, destination) pair (SPEC 1.3 "Objective Mapping"). Pairs not listed fall back to the objective's goals. */
const DESTINATION_GOALS: Partial<Record<MetaObjective, Partial<Record<MetaDestinationType, readonly MetaOptimizationGoal[]>>>> = {
  OUTCOME_TRAFFIC: {
    WEBSITE: ["LINK_CLICKS", "LANDING_PAGE_VIEWS", "REACH", "IMPRESSIONS"],
    APP: ["LINK_CLICKS", "LANDING_PAGE_VIEWS", "REACH", "IMPRESSIONS"],
    MESSENGER: ["LINK_CLICKS", "REACH", "IMPRESSIONS"],
    WHATSAPP: ["LINK_CLICKS", "REACH", "IMPRESSIONS"],
  },
  OUTCOME_ENGAGEMENT: {
    ON_POST: ["POST_ENGAGEMENT", "REACH", "IMPRESSIONS"],
    ON_PAGE: ["PAGE_LIKES"],
    ON_EVENT: ["EVENT_RESPONSES", "POST_ENGAGEMENT", "REACH", "IMPRESSIONS"],
    ON_VIDEO: ["THRUPLAY", "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS"],
    MESSENGER: ["CONVERSATIONS", "LINK_CLICKS", "LEAD_GENERATION"],
    WEBSITE: ["OFFSITE_CONVERSIONS"],
  },
  OUTCOME_LEADS: {
    ON_AD: ["LEAD_GENERATION", "QUALITY_LEAD"],
    MESSENGER: ["LEAD_GENERATION"],
    INSTAGRAM_DIRECT: ["LEAD_GENERATION"],
    WEBSITE: ["OFFSITE_CONVERSIONS", "LINK_CLICKS"],
  },
  OUTCOME_SALES: {
    WEBSITE: ["OFFSITE_CONVERSIONS"],
    APP: ["OFFSITE_CONVERSIONS"],
    MESSENGER: ["CONVERSATIONS"],
  },
};

/** Destinations an objective offers; null = the objective has no conversion location to choose. */
export function destinationsFor(objective: MetaObjective | null): readonly MetaDestinationType[] | null {
  return objective ? OBJECTIVE_RULES[objective].destinations : null;
}

/** Optimisation goals for the objective, narrowed by the chosen conversion location when Meta documents the pair. Always a subset of what the validator accepts. */
export function goalsFor(objective: MetaObjective | null, destination: MetaDestinationType | null): MetaOptimizationGoal[] {
  if (!objective) return [];
  const all = OBJECTIVE_RULES[objective].goals;
  const narrow = destination ? DESTINATION_GOALS[objective]?.[destination] : undefined;
  return narrow ? all.filter((g) => narrow.includes(g)) : [...all];
}

export const GOAL_LABEL: Partial<Record<MetaOptimizationGoal, string>> = {
  REACH: "Reach (people)", IMPRESSIONS: "Impressions", AD_RECALL_LIFT: "Ad recall lift", THRUPLAY: "ThruPlay (15 s or complete video views)", TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: "2-second continuous video views",
  LINK_CLICKS: "Link clicks", LANDING_PAGE_VIEWS: "Landing page views", QUALITY_CALL: "Quality calls", POST_ENGAGEMENT: "Post engagement", PAGE_LIKES: "Page likes", EVENT_RESPONSES: "Event responses",
  CONVERSATIONS: "Conversations", LEAD_GENERATION: "Leads", QUALITY_LEAD: "Quality leads", OFFSITE_CONVERSIONS: "Conversions (pixel event)", APP_INSTALLS: "App installs",
};
export const goalLabel = (g: MetaOptimizationGoal): string => GOAL_LABEL[g] ?? g.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** What the person must fill for the chosen goal, from the validator's own table. `needs` is the first way to satisfy it; `alt` the other (e.g. app instead of pixel). */
export function promotedNeeds(objective: MetaObjective | null, goal: MetaOptimizationGoal | null): { needs: PromotedKey[]; alt: PromotedKey[] | null } {
  const alts = objective && goal ? OBJECTIVE_RULES[objective].promoted[goal] : undefined;
  if (!alts || alts.length === 0) return { needs: [], alt: null };
  return { needs: [...alts[0]], alt: alts[1] ? [...alts[1]] : null };
}

/** Keeps an ad set consistent after the objective/destination/goal changes: drops a goal or destination the new combination no longer allows and re-derives the billing event. */
export function reconcileAdSet(set: MetaAdSetDraft, objective: MetaObjective | null): MetaAdSetDraft {
  const dests = destinationsFor(objective);
  let destinationType = set.destinationType;
  if (dests === null) destinationType = null;
  else if (destinationType && !dests.includes(destinationType)) destinationType = null;
  if (dests && !destinationType && dests.length === 1) destinationType = dests[0];
  const goals = goalsFor(objective, destinationType);
  let goal = set.optimizationGoal;
  if (goal && !goals.includes(goal)) goal = null;
  if (!goal && goals.length === 1) goal = goals[0];
  return { ...set, destinationType, optimizationGoal: goal, billingEvent: goal ? billingEventFor(goal) : null };
}

// ── placements ──────────────────────────────────────────────────────────────────────────────────────

export type PlacementGroup = "facebookPositions" | "instagramPositions" | "messengerPositions" | "audienceNetworkPositions";
export interface PlacementOption {
  group: PlacementGroup;
  publisher: "facebook" | "instagram" | "messenger" | "audience_network";
  value: string;
  label: string;
}
export const PLACEMENT_OPTIONS: PlacementOption[] = [
  { group: "facebookPositions", publisher: "facebook", value: "feed", label: "Facebook Feed" },
  { group: "facebookPositions", publisher: "facebook", value: "story", label: "Facebook Stories" },
  { group: "facebookPositions", publisher: "facebook", value: "facebook_reels", label: "Facebook Reels" },
  { group: "facebookPositions", publisher: "facebook", value: "right_hand_column", label: "Facebook right column" },
  { group: "facebookPositions", publisher: "facebook", value: "search", label: "Facebook search results" },
  { group: "facebookPositions", publisher: "facebook", value: "marketplace", label: "Facebook Marketplace" },
  { group: "facebookPositions", publisher: "facebook", value: "video_feeds", label: "Facebook video feeds" },
  { group: "instagramPositions", publisher: "instagram", value: "stream", label: "Instagram Feed" },
  { group: "instagramPositions", publisher: "instagram", value: "story", label: "Instagram Stories" },
  { group: "instagramPositions", publisher: "instagram", value: "reels", label: "Instagram Reels" },
  { group: "instagramPositions", publisher: "instagram", value: "explore", label: "Instagram Explore" },
  { group: "instagramPositions", publisher: "instagram", value: "profile_feed", label: "Instagram profile feed" },
  { group: "instagramPositions", publisher: "instagram", value: "ig_search", label: "Instagram search results" },
  { group: "messengerPositions", publisher: "messenger", value: "story", label: "Messenger Stories" },
  { group: "messengerPositions", publisher: "messenger", value: "sponsored_messages", label: "Messenger sponsored messages" },
  { group: "audienceNetworkPositions", publisher: "audience_network", value: "classic", label: "Audience Network" },
  { group: "audienceNetworkPositions", publisher: "audience_network", value: "rewarded_video", label: "Audience Network rewarded video" },
];

type Placements = MetaTargetingDraft["placements"];

export const isPlacementOn = (p: Placements, o: PlacementOption): boolean => p[o.group].includes(o.value);

/** Turns one placement on or off and keeps `publisherPlatforms` in step (a position needs its platform; a platform with no positions left is removed). */
export function togglePlacement(p: Placements, o: PlacementOption, on: boolean): Placements {
  const list = on ? [...new Set([...p[o.group], o.value])] : p[o.group].filter((x) => x !== o.value);
  const next: Placements = { ...p, automatic: false, [o.group]: list };
  let pubs = new Set(p.publisherPlatforms);
  if (on) pubs.add(o.publisher);
  else if (list.length === 0) pubs.delete(o.publisher);
  pubs = new Set([...pubs]);
  next.publisherPlatforms = [...pubs];
  return next;
}

/** Why a placement cannot be added right now, taken from the validator: the first new error that adding it would cause. null = fine. */
export function placementBlockReason(p: Placements, o: PlacementOption, goal: MetaOptimizationGoal | null): string | null {
  if (p.automatic) return null;
  if (isPlacementOn(p, o)) return null;
  const before = new Set(validatePlacements(p, goal, "p").map((e) => e.code));
  const after = validatePlacements(togglePlacement(p, o, true), goal, "p");
  return after.find((e) => !before.has(e.code) && !/^(an_alone|placement_none)$/.test(e.code))?.message ?? null;
}

/** Aspect-ratio facts used for the per-placement media notes. Same tolerances as the validator. */
export function aspectFit(width: number | null, height: number | null): { vertical: boolean; feed: boolean; ratio: number | null } {
  if (!width || !height) return { vertical: false, feed: false, ratio: null };
  const r = width / height;
  return { vertical: Math.abs(r - 9 / 16) / (9 / 16) <= 0.03, feed: r >= 0.55 && r <= 1.92, ratio: r };
}

/** Plain notes per selected placement for a media file. Warnings only: the validator never blocks on these. */
export function placementRatioNotes(media: { width: number | null; height: number | null } | null, p: Placements): string[] {
  const fit = aspectFit(media?.width ?? null, media?.height ?? null);
  if (!media || fit.ratio === null) return [];
  const notes: string[] = [];
  const stories = p.automatic ? true : p.facebookPositions.some((x) => ["story", "facebook_reels"].includes(x)) || p.instagramPositions.some((x) => ["story", "reels"].includes(x)) || p.messengerPositions.includes("story");
  if (stories && !fit.vertical) notes.push(p.automatic ? "Advantage+ placements can include Stories and Reels, which look best at 9:16 (1080 x 1920)." : "Stories and Reels look best at 9:16 (1080 x 1920); this file will be cropped or letterboxed there.");
  if (!fit.feed) notes.push("This shape is outside what Feed shows without cropping (4:5 to 1.91:1).");
  return notes;
}

// ── errors -> fields and steps ─────────────────────────────────────────────────────────────────────

export function stepForPath(path: string): WizardStepKey {
  if (/^meta\.(adAccountId|pageAccountId|instagramAccountId)$/.test(path)) return "account";
  if (/^meta\.adSets(\[|$)/.test(path)) return "adsets";
  if (/^ads(\[|$)/.test(path)) return "ads";
  if (/^meta\.(objective|specialAdCategor|bidStrategy|spendCapMinor|campaignBudget|startTime|stopTime)/.test(path)) return "campaign";
  return "review";
}

/** DOM id a field renders under, so an error can focus it. `meta.adSets[0].budget.amountMinor` -> `f-meta-adSets-0-budget-amountMinor`. */
export function fieldId(path: string): string {
  return `f-${path.replace(/\[([^\]]+)\]/g, "-$1").replace(/\./g, "-")}`;
}

/** The part of the path an error screen points to: a specific ad set index or ad id. */
export function adSetIndexOf(path: string): number | null {
  const m = /^meta\.adSets\[(\d+)\]/.exec(path);
  return m ? Number(m[1]) : null;
}
export function adIdOf(path: string): string | null {
  const m = /^ads\[([^\]]+)\]/.exec(path);
  return m ? m[1] : null;
}

export function errorsAt(list: FieldError[], prefix: string, exact = false): FieldError[] {
  return list.filter((e) => (exact ? e.path === prefix : e.path === prefix || e.path.startsWith(`${prefix}.`) || e.path.startsWith(`${prefix}[`)));
}

export function groupErrorsByStep(list: FieldError[]): Record<WizardStepKey, FieldError[]> {
  const out: Record<WizardStepKey, FieldError[]> = { account: [], campaign: [], adsets: [], ads: [], review: [] };
  for (const e of list) out[stepForPath(e.path)].push(e);
  return out;
}

/** "Ad set 2: Choose what the ad set optimises for." with a name when the path points at one. */
export function describeError(e: FieldError, ctx: { adSets: { name: string }[]; ads: { id: string; name: string }[] }): string {
  const i = adSetIndexOf(e.path);
  if (i !== null) return `Ad set ${i + 1}${ctx.adSets[i]?.name ? ` (${ctx.adSets[i].name})` : ""}: ${e.message}`;
  const a = adIdOf(e.path);
  if (a) {
    const idx = ctx.ads.findIndex((x) => x.id === a);
    return `Ad ${idx >= 0 ? idx + 1 : ""}${idx >= 0 && ctx.ads[idx].name ? ` (${ctx.ads[idx].name})` : ""}: ${e.message}`.replace("Ad : ", "Ad: ");
  }
  return e.message;
}

// ── wizard state ───────────────────────────────────────────────────────────────────────────────────

export interface WizardAd {
  /** Local key; equals the server id once saved. */
  key: string;
  /** Server id, null until the first save. */
  id: string | null;
  name: string;
  platform: "facebook" | "instagram";
  format: "image" | "video";
  headline: string;
  primaryText: string;
  description: string;
  mediaIds: string[];
  /** Media-card facts for the preview and ratio notes (kept so no extra fetch is needed). */
  mediaInfo: Record<string, { name: string; kind: "image" | "video"; width: number | null; height: number | null; durationSec: number | null; aiDisclosed: boolean }>;
  meta: MetaAdDraft;
}

export interface WizardState {
  campaignId: string | null;
  platform: AdsPlatformKey;
  name: string;
  /** Brief fields the AI works from and the rest of the app shows. */
  brief: { landingPage: string; targetAudience: string; offerService: string; tone: string; language: string; industry: string; brandInfo: string };
  currency: string;
  meta: MetaCampaignDraft;
  ads: WizardAd[];
  step: WizardStepKey;
  /** Acknowledgements and two UI choices the draft itself cannot hold: "no special ad category applies" (an explicit choice, since an empty list also means "not answered yet") and "budget on the campaign" (a budget type chosen before an amount is typed). */
  confirm: { billing: boolean; rights: boolean; policies: boolean; noSpecialCategory: boolean; cbo: boolean };
}

export const newKey = (prefix: string, taken: string[] = []): string => {
  let n = taken.length + 1;
  while (taken.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

export const emptyWizard = (): WizardState => ({
  campaignId: null, platform: "meta", name: "", brief: { landingPage: "", targetAudience: "", offerService: "", tone: "", language: "English", industry: "", brandInfo: "" }, currency: "", meta: emptyMetaCampaign(), ads: [], step: "account",
  confirm: { billing: false, rights: false, policies: false, noSpecialCategory: false, cbo: false },
});

export const blankAd = (key: string, adSetKey: string | null): WizardAd => ({ key, id: null, name: "", platform: "facebook", format: "image", headline: "", primaryText: "", description: "", mediaIds: [], mediaInfo: {}, meta: { ...emptyMetaAd(), adSetKey } });

export type WizardAction =
  | { type: "replace"; state: WizardState }
  | { type: "step"; step: WizardStepKey }
  | { type: "name"; name: string }
  | { type: "brief"; patch: Partial<WizardState["brief"]> }
  | { type: "currency"; currency: string }
  | { type: "campaign"; patch: Partial<MetaCampaignDraft> }
  | { type: "adset"; index: number; patch: Partial<MetaAdSetDraft> }
  | { type: "targeting"; index: number; patch: Partial<MetaTargetingDraft> }
  | { type: "addAdSet" }
  | { type: "duplicateAdSet"; index: number }
  | { type: "removeAdSet"; index: number }
  | { type: "ad"; key: string; patch: Partial<Omit<WizardAd, "meta">> }
  | { type: "adMeta"; key: string; patch: Partial<MetaAdDraft> }
  | { type: "addAd"; adSetKey: string | null; ad?: Partial<WizardAd> }
  | { type: "removeAd"; key: string }
  | { type: "saved"; campaignId: string; adIds: Record<string, string> }
  | { type: "confirm"; patch: Partial<WizardState["confirm"]> };

/** All draft edits go through here so the objective rules (destination, goal, billing event) stay consistent. */
export function wizardReducer(s: WizardState, a: WizardAction): WizardState {
  switch (a.type) {
    case "replace": return a.state;
    case "step": return { ...s, step: a.step };
    case "name": return { ...s, name: a.name };
    case "brief": return { ...s, brief: { ...s.brief, ...a.patch } };
    case "currency": return { ...s, currency: a.currency };
    case "confirm": return { ...s, confirm: { ...s.confirm, ...a.patch } };
    case "campaign": {
      const meta = { ...s.meta, ...a.patch };
      if ("objective" in a.patch && a.patch.objective !== s.meta.objective) meta.adSets = meta.adSets.map((x) => reconcileAdSet(x, meta.objective));
      // A budget lives on the campaign OR on its ad sets, never both.
      if (a.patch.campaignBudget) meta.adSets = meta.adSets.map((x) => ({ ...x, budget: null }));
      return { ...s, meta };
    }
    case "adset": {
      const adSets = s.meta.adSets.map((x, i) => {
        if (i !== a.index) return x;
        const next = { ...x, ...a.patch };
        if ("destinationType" in a.patch || "optimizationGoal" in a.patch) {
          const goals = goalsFor(s.meta.objective, next.destinationType);
          if (next.optimizationGoal && !goals.includes(next.optimizationGoal)) next.optimizationGoal = goals.length === 1 ? goals[0] : null;
          next.billingEvent = next.optimizationGoal ? billingEventFor(next.optimizationGoal) : null;
        }
        return next;
      });
      return { ...s, meta: { ...s.meta, adSets } };
    }
    case "targeting": return { ...s, meta: { ...s.meta, adSets: s.meta.adSets.map((x, i) => (i === a.index ? { ...x, targeting: { ...x.targeting, ...a.patch } } : x)) } };
    case "addAdSet": {
      const key = newKey("set", s.meta.adSets.map((x) => x.key));
      const set = reconcileAdSet(emptyAdSet(key, `Ad set ${s.meta.adSets.length + 1}`), s.meta.objective);
      return { ...s, meta: { ...s.meta, adSets: [...s.meta.adSets, s.meta.adSets[0] ? { ...set, targeting: structuredCloneJson(s.meta.adSets[0].targeting) } : set] } };
    }
    case "duplicateAdSet": {
      const src = s.meta.adSets[a.index];
      if (!src) return s;
      const key = newKey("set", s.meta.adSets.map((x) => x.key));
      const copy: MetaAdSetDraft = { ...structuredCloneJson(src), key, name: `${src.name} (copy)` };
      return { ...s, meta: { ...s.meta, adSets: [...s.meta.adSets, copy] } };
    }
    case "removeAdSet": {
      const gone = s.meta.adSets[a.index]?.key;
      return {
        ...s,
        meta: { ...s.meta, adSets: s.meta.adSets.filter((_, i) => i !== a.index) },
        // ads of a removed ad set stay but point nowhere, so the validator asks for a new ad set instead of losing the copy
        ads: s.ads.map((x) => (x.meta.adSetKey === gone ? { ...x, meta: { ...x.meta, adSetKey: null } } : x)),
      };
    }
    case "ad": return { ...s, ads: s.ads.map((x) => (x.key === a.key ? { ...x, ...a.patch } : x)) };
    case "adMeta": return { ...s, ads: s.ads.map((x) => (x.key === a.key ? { ...x, meta: { ...x.meta, ...a.patch } } : x)) };
    case "addAd": {
      const key = newKey("ad", s.ads.map((x) => x.key));
      return { ...s, ads: [...s.ads, { ...blankAd(key, a.adSetKey), ...a.ad, meta: { ...blankAd(key, a.adSetKey).meta, ...(a.ad?.meta ?? {}), adSetKey: a.adSetKey } }] };
    }
    case "removeAd": return { ...s, ads: s.ads.filter((x) => x.key !== a.key) };
    case "saved": return { ...s, campaignId: a.campaignId, ads: s.ads.map((x) => (a.adIds[x.key] ? { ...x, id: a.adIds[x.key], key: a.adIds[x.key] } : x)) };
  }
}

function structuredCloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** What gets saved: stable text used to detect "nothing changed since the last save". Excludes step and confirmations. */
export function draftSnapshot(s: WizardState): string {
  return JSON.stringify({ n: s.name, b: s.brief, m: s.meta, a: s.ads.map((x) => ({ k: x.key, n: x.name, p: x.platform, f: x.format, h: x.headline, t: x.primaryText, d: x.description, m: x.mediaIds, x: x.meta })) });
}

/** Light checks so the person is not sent to the server with nothing to save. The server validator (validateLaunch) is the real judge. */
export function canAutosave(s: WizardState): boolean {
  return s.name.trim().length > 0;
}

// ── commitment (display math; the guard uses `commitmentOf` on the server) ──────────────────────────

/** Sum of daily budgets for the "this will commit" line while editing. Mirrors `commitmentOf` for the daily figure only. */
export function dailyCommitmentMinor(c: MetaCampaignDraft): number {
  const d = (m: { type: string; amountMinor: number } | null) => (m && m.type === "daily" ? m.amountMinor : 0);
  return c.campaignBudget ? d(c.campaignBudget) : c.adSets.reduce((n, x) => n + d(x.budget), 0);
}

// ── launch / campaign status ───────────────────────────────────────────────────────────────────────

export type ListStatus = "draft" | "in_review" | "running" | "paused" | "ended" | "failed";
export const LIST_STATUS_LABEL: Record<ListStatus, string> = { draft: "Draft", in_review: "In review", running: "Running", paused: "Paused", ended: "Ended", failed: "Failed" };

export interface LaunchLike {
  state: "creating" | "partial" | "ready" | "rolled_back" | "failed";
  delivery: "paused" | "active" | "archived";
  active: boolean;
  review: Record<string, { effectiveStatus: string | null }>;
  stopTime?: string | null;
}
const PENDING_REVIEW = new Set(["PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED"]);
const BAD_REVIEW = new Set(["DISAPPROVED", "WITH_ISSUES"]);
export const reviewPending = (r: LaunchLike["review"]): boolean => Object.values(r).some((x) => x.effectiveStatus && PENDING_REVIEW.has(x.effectiveStatus));
export const reviewProblems = (r: LaunchLike["review"]): number => Object.values(r).filter((x) => x.effectiveStatus && BAD_REVIEW.has(x.effectiveStatus)).length;

/** The one status shown in the list and on tabs. No launch (or a rolled-back one) is a draft; unfinished or failed creation is "failed". */
export function listStatus(l: LaunchLike | null, now: Date = new Date()): ListStatus {
  if (!l || l.state === "rolled_back") return "draft";
  if (l.state === "failed" || l.state === "partial" || l.state === "creating") return "failed";
  if (l.delivery === "archived") return "ended";
  if (l.stopTime && new Date(l.stopTime) <= now) return "ended";
  if (reviewProblems(l.review) > 0) return "failed";
  if (l.delivery === "active") return reviewPending(l.review) ? "in_review" : "running";
  return "paused";
}

/** Whether the launch panel should keep polling, and how often. Hidden tabs and settled states stop; repeated errors back off then stop. */
export function pollPlan(i: { state: LaunchLike["state"] | null; delivery: LaunchLike["delivery"] | null; pendingReview: boolean; hidden: boolean; errors: number; sinceActionMs: number }): { poll: boolean; everyMs: number } {
  if (i.hidden || i.errors >= 5 || i.state === null) return { poll: false, everyMs: 0 };
  if (i.state === "rolled_back" || i.state === "failed" || i.delivery === "archived") return { poll: false, everyMs: 0 };
  const backoff = Math.min(2 ** i.errors, 8);
  if (i.state === "creating") return { poll: true, everyMs: 4000 * backoff };
  if (i.state === "ready" && i.delivery === "active" && i.pendingReview) return i.sinceActionMs > 30 * 60_000 ? { poll: false, everyMs: 0 } : { poll: true, everyMs: 30_000 * backoff };
  return { poll: false, everyMs: 0 };
}

const REVIEW_LABEL: Record<string, string> = {
  ACTIVE: "Active", PAUSED: "Paused", PENDING_REVIEW: "In review by Meta", IN_PROCESS: "Being processed by Meta", PREAPPROVED: "Pre-approved, waiting to run", DISAPPROVED: "Rejected by Meta", WITH_ISSUES: "Running with issues", ARCHIVED: "Archived", DELETED: "Deleted",
  CAMPAIGN_PAUSED: "Paused (campaign is paused)", ADSET_PAUSED: "Paused (ad set is paused)", PENDING_BILLING_INFO: "Waiting for payment details", WITH_ISSUES_PENDING: "Has issues",
};
export const reviewLabel = (s: string | null): string => (s ? REVIEW_LABEL[s] ?? s.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) : "Not synced yet");

/** Meta's review feedback arrives as "reason: detail". Shown as a sentence; the guidance is generic and says nothing Meta did not. */
export function explainIssue(raw: string): { title: string; detail: string | null } {
  const i = raw.indexOf(":");
  const key = (i > 0 ? raw.slice(0, i) : raw).trim();
  const detail = i > 0 ? raw.slice(i + 1).trim() : null;
  const title = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
  return { title: title || "Meta reported a problem", detail: detail && detail !== "null" ? detail : null };
}

/** Ads Manager link for an object we created. The path layout is Meta's public Ads Manager URL; if Meta changes it the link still opens the account. */
export function adsManagerUrl(actId: string, level: "campaign" | "adset" | "ad", id: string): string {
  const act = actId.replace(/^act_/, "");
  const [path, param] = level === "campaign" ? ["campaigns", "selected_campaign_ids"] : level === "adset" ? ["adsets", "selected_adset_ids"] : ["ads", "selected_ad_ids"];
  return `https://adsmanager.facebook.com/adsmanager/manage/${path}?act=${encodeURIComponent(act)}&${param}=${encodeURIComponent(id)}`;
}

// ── hand-offs ──────────────────────────────────────────────────────────────────────────────────────

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
/** `/campaigns/new?media=ID&media=ID2&ugc=PROJECT&step=ads` -> checked values. Anything malformed is dropped, never trusted. */
export function parseHandoff(sp: Record<string, string | string[] | undefined>): { mediaIds: string[]; ugcProjectId: string | null; step: WizardStepKey | null } {
  const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.split(",")).map((x) => x.trim()).filter((x) => ID_RE.test(x));
  const ugc = list(sp.ugc)[0] ?? null;
  const step = typeof sp.step === "string" && isStepKey(sp.step) ? sp.step : null;
  return { mediaIds: [...new Set(list(sp.media))].slice(0, 10), ugcProjectId: ugc, step };
}

// ── call-to-action choices ─────────────────────────────────────────────────────────────────────────

/** The button list per objective is Meta's: it publishes one enum, not a per-objective table (SPEC 1.5). We offer the sensible subset first and never hide the rest. */
export const CTA_BY_OBJECTIVE: Record<MetaObjective, string[]> = {
  OUTCOME_AWARENESS: ["LEARN_MORE", "WATCH_MORE", "SEE_MORE", "NO_BUTTON"],
  OUTCOME_TRAFFIC: ["LEARN_MORE", "SHOP_NOW", "VISIT_WEBSITE", "GET_OFFER", "CONTACT_US", "SEE_MORE", "MESSAGE_PAGE", "WHATSAPP_MESSAGE"],
  OUTCOME_ENGAGEMENT: ["LEARN_MORE", "MESSAGE_PAGE", "WHATSAPP_MESSAGE", "LIKE_PAGE", "WATCH_MORE", "SEE_MORE"],
  OUTCOME_LEADS: ["SIGN_UP", "GET_QUOTE", "APPLY_NOW", "CONTACT_US", "SUBSCRIBE", "BOOK_NOW", "LEARN_MORE", "INQUIRE_NOW", "MESSAGE_PAGE"],
  OUTCOME_APP_PROMOTION: ["INSTALL_MOBILE_APP", "USE_APP", "PLAY_GAME", "DOWNLOAD", "LEARN_MORE"],
  OUTCOME_SALES: ["SHOP_NOW", "BUY_NOW", "ORDER_NOW", "GET_OFFER", "BOOK_NOW", "SIGN_UP", "LEARN_MORE", "CONTACT_US"],
};
export const ctaLabel = (c: string): string => c.replaceAll("_", " ").toLowerCase().replace(/^./, (x) => x.toUpperCase());

// ── EU ──────────────────────────────────────────────────────────────────────────────────────────────

export const targetsEu = (t: MetaTargetingDraft): boolean => t.geo.countries.some((c) => (EU_COUNTRIES as readonly string[]).includes(c));

// ── validate-only platforms ────────────────────────────────────────────────────────────────────────

export interface PlatformStatus {
  key: AdsPlatformKey;
  live: boolean;
}
export const PLATFORM_ORDER: AdsPlatformKey[] = [...ADS_PLATFORMS];

export const emptyGoogleDraft = (): GoogleSearchCampaignDraft => ({ customerId: "", name: "", dailyBudgetMicros: 0, startDate: null, endDate: null, keywords: [], headlines: [], descriptions: [], finalUrl: "" });
export const emptyLinkedInGroup = (): LinkedInCampaignGroupDraft => ({ accountId: "", name: "", runStartMs: 0, runEndMs: null, totalBudget: null });
export const emptyLinkedInCampaign = (): LinkedInCampaignDraft => ({
  accountId: "", campaignGroupId: null, name: "", type: "SPONSORED_UPDATES", objectiveType: null, costType: "CPM", unitCost: null, dailyBudget: null, totalBudget: null, runStartMs: 0, runEndMs: null,
  locale: { country: "US", language: "en" }, optimizationTargetType: "NONE", audienceExpansionEnabled: false, offsiteDeliveryEnabled: false, creativeSelection: "OPTIMIZED", associatedEntity: null, targetingInclude: {},
});
export const emptyXDraft = (): XCampaignDraft => ({ accountId: "", fundingInstrumentId: "", name: "", dailyBudgetMicros: null, totalBudgetMicros: null, startTime: null, endTime: null, lineItems: [] });

/** Micros (Google/X) <-> a major amount typed by a person. */
export const microsToMajor = (micros: number): string => (micros > 0 ? String(micros / 1_000_000) : "");
export const majorToMicros = (text: string): number => {
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1_000_000) : 0;
};

export { emptyTargeting };

/** Google keyword notation: [exact], "phrase", otherwise broad. One keyword per line. */
export function parseKeywords(text: string): GoogleSearchCampaignDraft["keywords"] {
  return text.split("\n").map((x) => x.trim()).filter(Boolean).map((l) => (/^\[.+\]$/.test(l) ? { text: l.slice(1, -1).trim(), matchType: "EXACT" as const } : /^".+"$/.test(l) ? { text: l.slice(1, -1).trim(), matchType: "PHRASE" as const } : { text: l, matchType: "BROAD" as const }));
}
export const keywordsToText = (k: GoogleSearchCampaignDraft["keywords"]): string => k.map((x) => (x.matchType === "EXACT" ? `[${x.text}]` : x.matchType === "PHRASE" ? `"${x.text}"` : x.text)).join("\n");
