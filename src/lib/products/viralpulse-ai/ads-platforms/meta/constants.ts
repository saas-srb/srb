/** Meta Marketing API vocabulary, from the official reference pages (SPEC.md section 1). Pure: safe in client components. */

export const META_DEFAULT_VERSION = "v25.0";

export const META_OBJECTIVES = ["OUTCOME_AWARENESS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS", "OUTCOME_APP_PROMOTION", "OUTCOME_SALES"] as const;
export type MetaObjective = (typeof META_OBJECTIVES)[number];
export const META_OBJECTIVE_LABEL: Record<MetaObjective, string> = {
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_LEADS: "Leads",
  OUTCOME_APP_PROMOTION: "App promotion",
  OUTCOME_SALES: "Sales",
};

export const META_SPECIAL_AD_CATEGORIES = ["EMPLOYMENT", "HOUSING", "CREDIT", "ISSUES_ELECTIONS_POLITICS", "ONLINE_GAMBLING_AND_GAMING", "FINANCIAL_PRODUCTS_SERVICES"] as const;
export type MetaSpecialAdCategory = (typeof META_SPECIAL_AD_CATEGORIES)[number];

export const META_BID_STRATEGIES = ["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS"] as const;
export type MetaBidStrategy = (typeof META_BID_STRATEGIES)[number];
/** Strategies that need `bid_amount` (docs: "Required for LOWEST_COST_WITH_BID_CAP or COST_CAP"). */
export const BID_AMOUNT_STRATEGIES: readonly MetaBidStrategy[] = ["LOWEST_COST_WITH_BID_CAP", "COST_CAP"];

export const META_OPTIMIZATION_GOALS = [
  "NONE", "APP_INSTALLS", "AD_RECALL_LIFT", "ENGAGED_USERS", "EVENT_RESPONSES", "IMPRESSIONS", "LEAD_GENERATION", "QUALITY_LEAD", "LINK_CLICKS", "OFFSITE_CONVERSIONS", "PAGE_LIKES", "POST_ENGAGEMENT", "QUALITY_CALL", "REACH", "LANDING_PAGE_VIEWS",
  "VISIT_INSTAGRAM_PROFILE", "ENGAGED_PAGE_VIEWS", "VALUE", "THRUPLAY", "DERIVED_EVENTS", "APP_INSTALLS_AND_OFFSITE_CONVERSIONS", "CONVERSATIONS", "IN_APP_VALUE", "MESSAGING_PURCHASE_CONVERSION", "MESSAGING_DEEP_CONVERSATION_AND_FOLLOW", "SUBSCRIBERS",
  "REMINDERS_SET", "MEANINGFUL_CALL_ATTEMPT", "PROFILE_VISIT", "PROFILE_AND_PAGE_ENGAGEMENT", "ADVERTISER_SILOED_VALUE", "AUTOMATIC_OBJECTIVE", "MESSAGING_APPOINTMENT_CONVERSION",
  "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS",
] as const;
export type MetaOptimizationGoal = (typeof META_OPTIMIZATION_GOALS)[number];

export const META_BILLING_EVENTS = ["APP_INSTALLS", "IMPRESSIONS", "LINK_CLICKS", "NONE", "OFFER_CLAIMS", "PAGE_LIKES", "POST_ENGAGEMENT", "THRUPLAY", "PURCHASE", "LISTING_INTERACTION"] as const;
export type MetaBillingEvent = (typeof META_BILLING_EVENTS)[number];

export const META_DESTINATION_TYPES = [
  "WEBSITE", "APP", "MESSENGER", "APPLINKS_AUTOMATIC", "WHATSAPP", "INSTAGRAM_DIRECT", "FACEBOOK", "MESSAGING_MESSENGER_WHATSAPP", "MESSAGING_INSTAGRAM_DIRECT_MESSENGER", "MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP",
  "MESSAGING_INSTAGRAM_DIRECT_WHATSAPP", "SHOP_AUTOMATIC", "ON_AD", "ON_POST", "ON_EVENT", "ON_VIDEO", "ON_PAGE", "INSTAGRAM_PROFILE", "FACEBOOK_PAGE", "INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE", "INSTAGRAM_LIVE", "FACEBOOK_LIVE",
] as const;
export type MetaDestinationType = (typeof META_DESTINATION_TYPES)[number];

/** What an ad set needs under each objective (SPEC 1.3 "Objective Mapping"). `destinations: null` = the destination is not sent. */
export interface ObjectiveRule {
  goals: readonly MetaOptimizationGoal[];
  destinations: readonly MetaDestinationType[] | null;
  /** Fields of promoted_object that must be present for a goal (any one of the alternatives). */
  promoted: Partial<Record<MetaOptimizationGoal, readonly (readonly PromotedKey[])[]>>;
}
export type PromotedKey = "page_id" | "pixel_id" | "custom_event_type" | "application_id" | "object_store_url" | "product_catalog_id" | "product_set_id" | "offer_id" | "event_id";

export const OBJECTIVE_RULES: Record<MetaObjective, ObjectiveRule> = {
  OUTCOME_AWARENESS: {
    goals: ["REACH", "IMPRESSIONS", "AD_RECALL_LIFT", "THRUPLAY", "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS"],
    destinations: null,
    promoted: { REACH: [["page_id"]], IMPRESSIONS: [["page_id"]], AD_RECALL_LIFT: [["page_id"]], THRUPLAY: [["page_id"]], TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: [["page_id"]] },
  },
  OUTCOME_TRAFFIC: {
    goals: ["LINK_CLICKS", "LANDING_PAGE_VIEWS", "REACH", "IMPRESSIONS", "QUALITY_CALL"],
    destinations: ["WEBSITE", "APP", "MESSENGER", "WHATSAPP"],
    promoted: {},
  },
  OUTCOME_ENGAGEMENT: {
    goals: ["POST_ENGAGEMENT", "REACH", "IMPRESSIONS", "PAGE_LIKES", "EVENT_RESPONSES", "THRUPLAY", "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS", "CONVERSATIONS", "LINK_CLICKS", "LEAD_GENERATION", "OFFSITE_CONVERSIONS", "LANDING_PAGE_VIEWS"],
    destinations: ["ON_POST", "ON_PAGE", "ON_EVENT", "ON_VIDEO", "MESSENGER", "WEBSITE"],
    promoted: { PAGE_LIKES: [["page_id"]], CONVERSATIONS: [["page_id"]], LEAD_GENERATION: [["page_id"]], OFFSITE_CONVERSIONS: [["pixel_id", "custom_event_type"], ["application_id", "object_store_url"]] },
  },
  OUTCOME_LEADS: {
    goals: ["LEAD_GENERATION", "QUALITY_LEAD", "QUALITY_CALL", "OFFSITE_CONVERSIONS", "LINK_CLICKS"],
    destinations: ["ON_AD", "WEBSITE", "MESSENGER", "INSTAGRAM_DIRECT"],
    promoted: { LEAD_GENERATION: [["page_id"]], QUALITY_LEAD: [["page_id"]], QUALITY_CALL: [["page_id"]],OFFSITE_CONVERSIONS: [["pixel_id", "custom_event_type"], ["application_id", "object_store_url"]] },
  },
  OUTCOME_APP_PROMOTION: {
    goals: ["APP_INSTALLS", "OFFSITE_CONVERSIONS", "LINK_CLICKS"],
    destinations: null,
    promoted: { APP_INSTALLS: [["application_id", "object_store_url"]], OFFSITE_CONVERSIONS: [["application_id", "object_store_url"]], LINK_CLICKS: [["application_id", "object_store_url"]] },
  },
  OUTCOME_SALES: {
    goals: ["OFFSITE_CONVERSIONS", "CONVERSATIONS", "QUALITY_CALL", "LINK_CLICKS"],
    destinations: ["WEBSITE", "APP", "MESSENGER"],
    promoted: {
      OFFSITE_CONVERSIONS: [["pixel_id", "custom_event_type"], ["application_id", "object_store_url"]],
      CONVERSATIONS: [["page_id", "pixel_id", "custom_event_type"]],
      QUALITY_CALL: [["page_id"]],
      LINK_CLICKS: [["product_catalog_id"], ["product_set_id", "custom_event_type"]],
    },
  },
};

/** Billing event that matches an optimisation goal. Meta does not publish a per-objective table (SPEC 1.3), so these are Meta's documented defaults; the API stays the final judge. */
export const DEFAULT_BILLING_EVENT: Partial<Record<MetaOptimizationGoal, MetaBillingEvent>> = {
  THRUPLAY: "THRUPLAY",
  TWO_SECOND_CONTINUOUS_VIDEO_VIEWS: "IMPRESSIONS",
  LINK_CLICKS: "IMPRESSIONS",
  PAGE_LIKES: "IMPRESSIONS",
  POST_ENGAGEMENT: "IMPRESSIONS",
  APP_INSTALLS: "IMPRESSIONS",
};
export function billingEventFor(goal: MetaOptimizationGoal): MetaBillingEvent {
  return DEFAULT_BILLING_EVENT[goal] ?? "IMPRESSIONS";
}

export const META_CUSTOM_EVENT_TYPES = [
  "RATE", "TUTORIAL_COMPLETION", "CONTACT", "CUSTOMIZE_PRODUCT", "DONATE", "FIND_LOCATION", "SCHEDULE", "START_TRIAL", "SUBMIT_APPLICATION", "SUBSCRIBE", "ADD_TO_CART", "ADD_TO_WISHLIST", "INITIATED_CHECKOUT", "ADD_PAYMENT_INFO",
  "PURCHASE", "LEAD", "COMPLETE_REGISTRATION", "CONTENT_VIEW", "SEARCH", "SERVICE_BOOKING_REQUEST", "MESSAGING_CONVERSATION_STARTED_7D", "LEVEL_ACHIEVED", "ACHIEVEMENT_UNLOCKED", "SPENT_CREDITS", "LISTING_INTERACTION", "D2_RETENTION", "D7_RETENTION", "OTHER",
] as const;

export const META_ATTRIBUTION_EVENTS = ["CLICK_THROUGH", "VIEW_THROUGH", "ENGAGED_VIDEO_VIEW"] as const;
export const META_FREQUENCY_EVENTS = ["IMPRESSIONS", "VIDEO_VIEWS", "VIDEO_VIEWS_2S", "VIDEO_VIEWS_15S"] as const;

// ── placements (placement-targeting reference) ──
export const PUBLISHER_PLATFORMS = ["facebook", "instagram", "threads", "messenger", "audience_network", "whatsapp"] as const;
export const FACEBOOK_POSITIONS = ["feed", "right_hand_column", "marketplace", "video_feeds", "story", "search", "instream_video", "facebook_reels", "facebook_reels_overlay", "profile_feed", "notification"] as const;
export const INSTAGRAM_POSITIONS = ["stream", "story", "explore", "explore_home", "reels", "profile_feed", "ig_search", "profile_reels"] as const;
export const MESSENGER_POSITIONS = ["sponsored_messages", "story"] as const;
export const AUDIENCE_NETWORK_POSITIONS = ["classic", "rewarded_video"] as const;
export const DEVICE_PLATFORMS = ["mobile", "desktop"] as const;

// ── creative ──
/** The call-to-action types the wizard offers: a verified subset of the enum on the ad creative reference. Any other value is rejected by Meta (error 1373054). */
export const META_CTA_TYPES = [
  "LEARN_MORE", "SHOP_NOW", "SIGN_UP", "BOOK_TRAVEL", "BOOK_NOW", "DOWNLOAD", "CONTACT_US", "GET_QUOTE", "SUBSCRIBE", "APPLY_NOW", "GET_OFFER", "ORDER_NOW", "WATCH_MORE", "MESSAGE_PAGE", "WHATSAPP_MESSAGE",
  "GET_DIRECTIONS", "CALL_NOW", "INSTALL_MOBILE_APP", "USE_APP", "PLAY_GAME", "DONATE_NOW", "SEE_MORE", "BUY_NOW", "GET_SHOWTIMES", "LISTEN_NOW", "REQUEST_TIME", "OPEN_LINK", "LIKE_PAGE", "NO_BUTTON", "WATCH_VIDEO", "GET_STARTED",
  "TRY_DEMO", "INQUIRE_NOW", "MAKE_AN_APPOINTMENT", "BOOK_A_CONSULTATION", "GET_A_QUOTE", "ASK_ABOUT_SERVICES", "SEND_UPDATES", "VISIT_WEBSITE", "FOLLOW_PAGE", "VIEW_PRODUCT",
] as const;
export type MetaCtaType = (typeof META_CTA_TYPES)[number];

/** Free-text CTA labels written by the AI or older ads, mapped to the API enum. Anything not listed maps to null (the user must pick). */
const CTA_ALIASES: Record<string, MetaCtaType> = {
  "learn more": "LEARN_MORE", "shop now": "SHOP_NOW", "sign up": "SIGN_UP", "book now": "BOOK_NOW", "book travel": "BOOK_TRAVEL", download: "DOWNLOAD", "contact us": "CONTACT_US", "get quote": "GET_QUOTE", "get a quote": "GET_QUOTE",
  subscribe: "SUBSCRIBE", "apply now": "APPLY_NOW", "get offer": "GET_OFFER", "order now": "ORDER_NOW", "watch more": "WATCH_MORE", "send message": "MESSAGE_PAGE", "message us": "MESSAGE_PAGE", "whatsapp us": "WHATSAPP_MESSAGE",
  "get directions": "GET_DIRECTIONS", "call now": "CALL_NOW", "install now": "INSTALL_MOBILE_APP", "donate now": "DONATE_NOW", "see more": "SEE_MORE", "buy now": "BUY_NOW", "get started": "GET_STARTED", "try demo": "TRY_DEMO", "inquire now": "INQUIRE_NOW",
  "book a consultation": "BOOK_A_CONSULTATION", "book appointment": "MAKE_AN_APPOINTMENT",
};
export function ctaFromText(text: string): MetaCtaType | null {
  const t = text.trim();
  if ((META_CTA_TYPES as readonly string[]).includes(t)) return t as MetaCtaType;
  return CTA_ALIASES[t.toLowerCase()] ?? null;
}

export const COUNTRY_RE = /^[A-Z]{2}$/;

/** EU / associated territories where the Digital Services Act payor and beneficiary are required (SPEC 1.3). Two-letter codes of the EU-27 plus EEA states Meta lists under the EU rule are not published as a list; this is the EU-27 and is a warning-level check. */
export const EU_COUNTRIES = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"] as const;

export const AD_STATUS_REVIEW = ["PENDING_REVIEW", "DISAPPROVED", "WITH_ISSUES", "PREAPPROVED", "IN_PROCESS", "PENDING_BILLING_INFO"] as const;
export const META_ACCOUNT_STATUS: Record<number, string> = {
  1: "Active", 2: "Disabled", 3: "Unsettled (payment owed)", 7: "Pending risk review", 8: "Pending settlement", 9: "In grace period", 100: "Pending closure", 101: "Closed",
};
export const META_NO_CAP = 922337203685478;
