/**
 * Client-safe Festival Offers constants and pure helpers. NEVER import
 * `server-only` here — this module is imported by client components (forms,
 * cards, the audience selector, the claim modal). Server modules re-export
 * from here where convenient.
 *
 * Badge/dot class shapes mirror `src/lib/cohort-ai/constants.ts` so the shared
 * badge styling applies unchanged.
 */

import type { CategorySlug } from "@/lib/categories";

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

export const AUDIENCES = [
  { value: "CLIENT", label: "Client" },
  { value: "BUSINESS", label: "Business / Enterprise" },
  { value: "STUDENT", label: "Student / Developer" },
  { value: "LEARNER", label: "Learner / Trainee" },
  { value: "INTERN", label: "Internship" },
  { value: "HIRING", label: "Hiring / Resource Augmentation" },
  { value: "ALL", label: "Everyone" },
] as const;

/**
 * Targeting presets for the LMS offer form — one click selects the audiences
 * that make sense together, instead of hand-ticking checkboxes.
 */
export const AUDIENCE_PRESETS: { key: string; label: string; hint: string; audiences: Audience[] }[] = [
  { key: "clients", label: "Clients", hint: "Software & AI project buyers", audiences: ["CLIENT", "BUSINESS"] },
  { key: "business", label: "Business / Enterprise", hint: "Companies scaling teams or products", audiences: ["BUSINESS", "HIRING"] },
  { key: "students", label: "Students", hint: "College students & developers", audiences: ["STUDENT", "LEARNER"] },
  { key: "learners", label: "Learners / Trainees", hint: "Enrolled or upskilling learners", audiences: ["LEARNER", "STUDENT"] },
  { key: "interns", label: "Interns", hint: "Internship applicants", audiences: ["INTERN", "STUDENT"] },
  { key: "hiring", label: "Hiring managers", hint: "Teams that need developers", audiences: ["HIRING", "BUSINESS"] },
  { key: "everyone", label: "Everyone", hint: "Shown to all visitors", audiences: ["ALL"] },
];

/** A claimant of audience X is also eligible for offers/coupons targeted at its aliases. */
export function audienceAliases(audience: Audience): Audience[] {
  switch (audience) {
    case "CLIENT":
      return ["CLIENT", "BUSINESS", "ALL"];
    case "HIRING":
      return ["HIRING", "BUSINESS", "ALL"];
    case "STUDENT":
      return ["STUDENT", "LEARNER", "ALL"];
    case "INTERN":
      return ["INTERN", "STUDENT", "LEARNER", "ALL"];
    default:
      return [audience, "ALL"];
  }
}

/** Signed-in portal role -> the public offers tab that best matches it. */
export function tabForPortalRole(role: string | null | undefined): PublicAudienceTabKey | null {
  switch (role) {
    case "client":
      return "CLIENT";
    case "intern":
    case "trainee":
    case "job_applicant":
      return "STUDENT";
    default:
      return null;
  }
}

export type Audience = (typeof AUDIENCES)[number]["value"];

export function isValidAudience(value: unknown): value is Audience {
  return typeof value === "string" && AUDIENCES.some((a) => a.value === value);
}

export function getAudienceLabel(value: string): string {
  return AUDIENCES.find((a) => a.value === value)?.label ?? value;
}

/** The 3 public-facing audience-selector tabs. "Student" also surfaces Internship offers. */
export const PUBLIC_AUDIENCE_TABS = [
  { key: "CLIENT", label: "I'm a Business / Client", cta: "Explore Client Offers", matches: ["CLIENT", "BUSINESS", "HIRING"] as Audience[] },
  { key: "STUDENT", label: "I'm a Student / Developer", cta: "Explore Student Offers", matches: ["STUDENT", "LEARNER", "INTERN"] as Audience[] },
  { key: "HIRING", label: "I Need Developers", cta: "Explore Hiring Offers", matches: ["HIRING"] as Audience[] },
] as const;

export type PublicAudienceTabKey = (typeof PUBLIC_AUDIENCE_TABS)[number]["key"];

// ---------------------------------------------------------------------------
// Offer marketplace taxonomy
// ---------------------------------------------------------------------------

/** An offer can carry several tags (e.g. a flash, student, course offer). Order = display order of the filter bar. */
export const OFFER_TYPES = [
  { value: "limited_time", label: "Limited-Time", blurb: "Strong deadline, live countdown" },
  { value: "flash", label: "Flash", blurb: "Short-duration special deals" },
  { value: "combo", label: "Combo", blurb: "Bundled services or courses" },
  { value: "course", label: "DealFlow Courses", blurb: "Course discounts & enrollments" },
  { value: "student", label: "Student", blurb: "Student-only pricing" },
  { value: "hourly", label: "Hourly Rates", blurb: "Developer rate per hour" },
  { value: "hiring", label: "Developer Hiring", blurb: "Dedicated developers & teams" },
  { value: "project", label: "Project-Based", blurb: "Fixed-price packages" },
  { value: "service", label: "Services", blurb: "Web, app, AI & software" },
  { value: "subscription", label: "Subscriptions", blurb: "Monthly / yearly plans" },
  { value: "client", label: "Client", blurb: "Project & service packages" },
  { value: "business", label: "Business", blurb: "Hiring & technology packages" },
  { value: "referral", label: "Referral", blurb: "Rewards & credits for referrals" },
  { value: "first_time", label: "First-Time", blurb: "New-user welcome offers" },
  { value: "renewal", label: "Renewal & Upgrade", blurb: "For existing customers" },
  { value: "seasonal", label: "Festival & Seasonal", blurb: "Scheduled campaigns" },
  { value: "personalized", label: "Picked For You", blurb: "Matched to your profile" },
] as const;

export type OfferType = (typeof OFFER_TYPES)[number]["value"];

export function isValidOfferType(value: unknown): value is OfferType {
  return typeof value === "string" && OFFER_TYPES.some((t) => t.value === value);
}

export function getOfferTypeLabel(value: string): string {
  return OFFER_TYPES.find((t) => t.value === value)?.label ?? value;
}

/** What one "unit" of the price means. `fixed` = a one-off package price. */
export const PRICING_UNITS = [
  { value: "fixed", label: "One-off / package", suffix: "" },
  { value: "hour", label: "Per hour", suffix: "/hr" },
  { value: "month", label: "Per month", suffix: "/mo" },
  { value: "year", label: "Per year", suffix: "/yr" },
] as const;

export type PricingUnit = (typeof PRICING_UNITS)[number]["value"];

export function isValidPricingUnit(value: unknown): value is PricingUnit {
  return typeof value === "string" && PRICING_UNITS.some((u) => u.value === value);
}

export function unitSuffix(unit: string | undefined | null): string {
  return PRICING_UNITS.find((u) => u.value === unit)?.suffix ?? "";
}

/** Who may claim, beyond the audience: first-time offers block repeat claimers, renewal offers need an existing account. */
export const OFFER_SEGMENTS = [
  { value: "any", label: "Anyone" },
  { value: "new_user", label: "First-time users only" },
  { value: "existing_user", label: "Existing customers only (signed in)" },
] as const;

export type OfferSegment = (typeof OFFER_SEGMENTS)[number]["value"];

export function isValidOfferSegment(value: unknown): value is OfferSegment {
  return typeof value === "string" && OFFER_SEGMENTS.some((s) => s.value === value);
}

/** What the limited quantity means in copy: seats/slots vs units. */
export const LIMIT_KINDS = [
  { value: "slots", label: "Slots / seats", noun: "slots" },
  { value: "quantity", label: "Quantity", noun: "left in stock" },
] as const;

export type LimitKind = (typeof LIMIT_KINDS)[number]["value"];

export interface LinkedItem {
  kind: "course" | "service" | "product" | "program";
  label: string;
  href: string;
}

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

export const CAMPAIGN_TYPES = [
  { value: "festival", label: "Festival" },
  { value: "seasonal", label: "Seasonal Sale" },
  { value: "flash-sale", label: "Flash Sale" },
  { value: "evergreen", label: "Evergreen" },
] as const;

export type CampaignType = (typeof CAMPAIGN_TYPES)[number]["value"];

export function isValidCampaignType(value: unknown): value is CampaignType {
  return typeof value === "string" && CAMPAIGN_TYPES.some((t) => t.value === value);
}

export const CAMPAIGN_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50" },
  { value: "scheduled", label: "Scheduled", badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400", dotClass: "bg-blue-500" },
  { value: "active", label: "Active", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "paused", label: "Paused", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  { value: "expired", label: "Expired", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/60" },
  { value: "archived", label: "Archived", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/40" },
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]["value"];

export const DEFAULT_CAMPAIGN_STATUS: CampaignStatus = "draft";

export function isValidCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === "string" && CAMPAIGN_STATUSES.some((s) => s.value === value);
}

export function getCampaignStatusMeta(status: string | undefined) {
  return CAMPAIGN_STATUSES.find((s) => s.value === status) ?? CAMPAIGN_STATUSES[0];
}

/**
 * Display-only status that folds the date window into the stored `status`
 * (e.g. a "scheduled" campaign whose window has passed reads as "expired" in
 * the admin list, even though nothing has flipped its stored status). Purely
 * cosmetic — `getActiveCampaign()` in `campaigns.ts` is the functional source
 * of truth and does its own date comparison independently.
 */
export function getCampaignEffectiveStatus(
  status: CampaignStatus,
  startDate: Date | string,
  endDate: Date | string,
  now: Date = new Date()
): CampaignStatus {
  if (status === "draft" || status === "paused" || status === "archived") return status;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (now < start) return "scheduled";
  if (now > end) return "expired";
  return "active";
}

// ---------------------------------------------------------------------------
// Offer
// ---------------------------------------------------------------------------

export const OFFER_STATUSES = [
  { value: "draft", label: "Draft", badgeClass: "bg-secondary/60 text-secondary-foreground", dotClass: "bg-secondary-foreground/50" },
  { value: "active", label: "Active", badgeClass: "bg-green-500/15 text-green-600 dark:text-green-400", dotClass: "bg-green-500" },
  { value: "paused", label: "Paused", badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", dotClass: "bg-amber-500" },
  { value: "expired", label: "Expired", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/60" },
  { value: "archived", label: "Archived", badgeClass: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground/40" },
] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number]["value"];

export const DEFAULT_OFFER_STATUS: OfferStatus = "draft";

export function isValidOfferStatus(value: unknown): value is OfferStatus {
  return typeof value === "string" && OFFER_STATUSES.some((s) => s.value === value);
}

export function getOfferStatusMeta(status: string | undefined) {
  return OFFER_STATUSES.find((s) => s.value === status) ?? OFFER_STATUSES[0];
}

export const PRICING_MODES = [
  { value: "percentage", label: "Percentage off" },
  { value: "flat", label: "Flat amount off" },
  { value: "custom_quote", label: "Custom Quote (no numeric price)" },
] as const;

export type PricingMode = (typeof PRICING_MODES)[number]["value"];

export function isValidPricingMode(value: unknown): value is PricingMode {
  return typeof value === "string" && PRICING_MODES.some((m) => m.value === value);
}

export const DISCOUNT_TYPES = [
  { value: "percentage", label: "Percentage" },
  { value: "flat", label: "Flat amount" },
] as const;

export type DiscountType = (typeof DISCOUNT_TYPES)[number]["value"];

export function isValidDiscountType(value: unknown): value is DiscountType {
  return typeof value === "string" && DISCOUNT_TYPES.some((t) => t.value === value);
}

export const DEFAULT_CURRENCY = "INR";

/** Builds a human badge string from an offer's pricing config, e.g. "UP TO 70% OFF" / "₹10,000 OFF" / "Custom Quote". */
export function formatOfferBadge(pricing: {
  mode: PricingMode;
  percentage?: number | null;
  flatDiscountAmount?: number | null;
  currency?: string | null;
  startingPriceLabel?: string | null;
}): string {
  if (pricing.mode === "percentage" && pricing.percentage) return `UP TO ${pricing.percentage}% OFF`;
  if (pricing.mode === "flat" && pricing.flatDiscountAmount) {
    const currency = pricing.currency ?? DEFAULT_CURRENCY;
    return `${currency === "INR" ? "₹" : currency + " "}${pricing.flatDiscountAmount.toLocaleString("en-IN")} OFF`;
  }
  return pricing.startingPriceLabel?.trim() || "Custom Quote";
}

/**
 * Display-only price maths for cards. Mirrors the server's own formula in the
 * claim route (which is what actually decides the price — this never does).
 */
export function estimateSavings(pricing: {
  mode: PricingMode;
  originalPrice?: number | null;
  percentage?: number | null;
  flatDiscountAmount?: number | null;
}): { original: number | null; savings: number; final: number | null } {
  if (pricing.mode === "custom_quote" || !pricing.originalPrice) return { original: null, savings: 0, final: null };
  const original = pricing.originalPrice;
  let savings = 0;
  if (pricing.mode === "percentage" && pricing.percentage) savings = original * (pricing.percentage / 100);
  else if (pricing.mode === "flat" && pricing.flatDiscountAmount) savings = pricing.flatDiscountAmount;
  savings = Math.min(Math.round(savings), original);
  return { original, savings, final: original - savings };
}

// ---------------------------------------------------------------------------
// Service reference href — where a claimed service's real detail page lives.
// Each pillar uses a different URL convention on the public site today; this
// is a read helper only, no new pages are created here.
// ---------------------------------------------------------------------------

export function getServiceHref(category: CategorySlug, subService: string): string {
  switch (category) {
    case "software-development":
      return subService === "all" ? "/software-development" : `/services/${subService}`;
    case "digital-marketing":
      return subService === "all" ? "/digital-marketing" : `/services/digital-marketing/${subService}`;
    case "ai-automations":
      return subService === "all" ? "/ai-automations" : `/ai-automations/${subService}`;
    case "resource-augmentation":
      return subService === "all" ? "/resource-augmentation" : `/resource-augmentation/${subService}`;
    case "industrial-training":
      return "/industrial-training";
    case "internship-program":
      return "/internship-program";
    default:
      return "/services";
  }
}

/** A CTA that should open the claim form in place rather than navigate (the default `/offers` target, with or without a hash/query). */
export function isClaimHref(href: string | null | undefined): boolean {
  if (!href) return true;
  return href === "/offers" || href.startsWith("/offers#") || href.startsWith("/offers?");
}

// ---------------------------------------------------------------------------
// Analytics event types
// ---------------------------------------------------------------------------

export const EVENT_TYPES = [
  "campaign_view",
  "offer_view",
  "offer_click",
  "form_start",
  "coupon_apply",
  "whatsapp_click",
  "call_click",
  "exit_intent_shown",
  "scroll_cta_click",
  "strip_view",
  "strip_click",
  "strip_close",
  "popup_view",
  "popup_click",
  "popup_close",
  "offer_detail_open",
  "countdown_expired",
  "personalized_view",
  "share_click",
] as const;

export type OfferEventType = (typeof EVENT_TYPES)[number];

export function isValidEventType(value: unknown): value is OfferEventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

export const DEVICE_TYPES = ["mobile", "tablet", "desktop"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export function isValidDeviceType(value: unknown): value is DeviceType {
  return typeof value === "string" && (DEVICE_TYPES as readonly string[]).includes(value);
}

/** Classifies a viewport width the same way this codebase's own Tailwind breakpoints do (sm=640, lg=1024). */
export function classifyDevice(viewportWidth: number): DeviceType {
  if (viewportWidth < 640) return "mobile";
  if (viewportWidth < 1024) return "tablet";
  return "desktop";
}

// ---------------------------------------------------------------------------
// Festival theme presets — an optional starting point for a campaign's
// theme colors; the admin can still hand-edit primaryColor/accentColor
// afterwards. "custom" (the default) applies no preset at all.
// ---------------------------------------------------------------------------

export const CAMPAIGN_THEME_PRESETS = [
  { key: "custom", label: "Custom (manual colors)", emoji: null, primaryColor: null, accentColor: null },
  { key: "diwali", label: "Diwali — Festive Gold", emoji: "🪔", primaryColor: "#E8590C", accentColor: "#D4AF37" },
  { key: "holi", label: "Holi — Colorful", emoji: "🎨", primaryColor: "#E0537A", accentColor: "#4CAF93" },
  { key: "new-year", label: "New Year — Modern", emoji: "🎉", primaryColor: "#2B59C3", accentColor: "#E8590C" },
  { key: "independence-day", label: "Independence Day — Patriotic", emoji: "🇮🇳", primaryColor: "#FF9933", accentColor: "#138808" },
  { key: "christmas", label: "Christmas", emoji: "🎄", primaryColor: "#B3261E", accentColor: "#1E7A4C" },
  { key: "summer-sale", label: "Summer Sale", emoji: "☀️", primaryColor: "#F5A623", accentColor: "#2B59C3" },
  { key: "back-to-college", label: "Back to College", emoji: "🎓", primaryColor: "#2B59C3", accentColor: "#E8590C" },
] as const;

export type CampaignThemePreset = (typeof CAMPAIGN_THEME_PRESETS)[number]["key"];

export const DEFAULT_THEME_PRESET: CampaignThemePreset = "custom";

export function isValidThemePreset(value: unknown): value is CampaignThemePreset {
  return typeof value === "string" && CAMPAIGN_THEME_PRESETS.some((p) => p.key === value);
}

export function getThemePreset(key: string | undefined) {
  return CAMPAIGN_THEME_PRESETS.find((p) => p.key === key) ?? CAMPAIGN_THEME_PRESETS[0];
}

// ---------------------------------------------------------------------------
// Generic label helper
// ---------------------------------------------------------------------------

export function titleize(value: string): string {
  return value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Global promotions — top strip + popup, both driven by the same campaign
// engine (`OfferCampaign.display`). Never a second campaign/offer system.
// ---------------------------------------------------------------------------

export const CTA_ACTION_TYPES = [
  { value: "url", label: "Go to a page" },
  { value: "whatsapp", label: "Open WhatsApp" },
  { value: "call", label: "Call us" },
] as const;

export type CtaActionType = (typeof CTA_ACTION_TYPES)[number]["value"];

export function isValidCtaActionType(value: unknown): value is CtaActionType {
  return typeof value === "string" && CTA_ACTION_TYPES.some((t) => t.value === value);
}

export const POPUP_TEMPLATES = [
  { value: "festival", label: "Festival", emoji: "🔥", heading: "Festival Offer" },
  { value: "student", label: "Student", emoji: "🎓", heading: "Student Offer" },
  { value: "client", label: "Business / Client", emoji: "🚀", heading: "Business Offer" },
  { value: "hiring", label: "Hiring", emoji: "👨‍💻", heading: "Hiring Offer" },
] as const;

export type PopupTemplate = (typeof POPUP_TEMPLATES)[number]["value"];

export function isValidPopupTemplate(value: unknown): value is PopupTemplate {
  return typeof value === "string" && POPUP_TEMPLATES.some((t) => t.value === value);
}

export function getPopupTemplateMeta(value: string | undefined) {
  return POPUP_TEMPLATES.find((t) => t.value === value) ?? POPUP_TEMPLATES[0];
}

export const POPUP_TRIGGER_TYPES = [
  { value: "immediate", label: "Immediate (0s)" },
  { value: "delay", label: "Delayed (seconds)" },
  { value: "scroll", label: "Scroll depth (%)" },
  { value: "exit_intent", label: "Exit intent (desktop)" },
] as const;

export type PopupTriggerType = (typeof POPUP_TRIGGER_TYPES)[number]["value"];

export function isValidPopupTriggerType(value: unknown): value is PopupTriggerType {
  return typeof value === "string" && POPUP_TRIGGER_TYPES.some((t) => t.value === value);
}

export const POPUP_FREQUENCIES = [
  { value: "session", label: "Once per session" },
  { value: "daily", label: "Once per day" },
  { value: "every_3_days", label: "Once every 3 days" },
  { value: "per_campaign", label: "Once per campaign" },
  { value: "every_visit", label: "Every visit" },
] as const;

export type PopupFrequency = (typeof POPUP_FREQUENCIES)[number]["value"];

export const DEFAULT_POPUP_FREQUENCY: PopupFrequency = "session";

export function isValidPopupFrequency(value: unknown): value is PopupFrequency {
  return typeof value === "string" && POPUP_FREQUENCIES.some((f) => f.value === value);
}

/** The page-targeting checkbox list — path PREFIXES matched via `pathname.startsWith()`. */
export const TARGETABLE_PAGES = [
  { path: "/", label: "Homepage" },
  { path: "/services", label: "Services hub" },
  { path: "/software-development", label: "Software Development" },
  { path: "/digital-marketing", label: "Digital Marketing" },
  { path: "/ai-automations", label: "AI & Automations" },
  { path: "/industrial-training", label: "Training" },
  { path: "/internship-program", label: "Internship" },
  { path: "/resource-augmentation", label: "Resource Augmentation / Hiring" },
  { path: "/careers", label: "Careers" },
  { path: "/offers", label: "Offers page" },
] as const;

export const PAGE_TARGETING_MODES = [
  { value: "all", label: "All public pages" },
  { value: "selected", label: "Selected pages only" },
] as const;

export type PageTargetingMode = (typeof PAGE_TARGETING_MODES)[number]["value"];

export function isValidPageTargetingMode(value: unknown): value is PageTargetingMode {
  return typeof value === "string" && PAGE_TARGETING_MODES.some((m) => m.value === value);
}

/** `pathname === "/"` needs an exact match; every other target is a prefix match (so `/services` also matches `/services/web-app-development`). */
export function pathMatchesTarget(pathname: string, target: string): boolean {
  return target === "/" ? pathname === "/" : pathname === target || pathname.startsWith(`${target}/`);
}

export function pageIsTargeted(pathname: string, targeting: { mode: PageTargetingMode; pages: string[] }): boolean {
  if (targeting.mode === "all") return true;
  return targeting.pages.some((p) => pathMatchesTarget(pathname, p));
}

/** Maps the current pathname to the `Audience` its visitor most likely belongs to, for context-aware offer selection. Defaults to "ALL" (unbiased) when no page-specific signal exists. */
export function audienceForPath(pathname: string): Audience {
  if (pathMatchesTarget(pathname, "/internship-program")) return "INTERN";
  if (pathMatchesTarget(pathname, "/industrial-training")) return "STUDENT";
  if (pathMatchesTarget(pathname, "/resource-augmentation")) return "HIRING";
  if (pathMatchesTarget(pathname, "/careers")) return "STUDENT";
  if (pathMatchesTarget(pathname, "/software-development") || pathMatchesTarget(pathname, "/digital-marketing") || pathMatchesTarget(pathname, "/ai-automations") || pathMatchesTarget(pathname, "/services")) return "CLIENT";
  return "ALL";
}

/** Maps the current pathname to the real `CategorySlug` it most directly represents, for picking a matching real offer. Undefined when the page has no single clear category (e.g. the homepage). */
export function categoryForPath(pathname: string): CategorySlug | undefined {
  if (pathMatchesTarget(pathname, "/internship-program")) return "internship-program";
  if (pathMatchesTarget(pathname, "/industrial-training")) return "industrial-training";
  if (pathMatchesTarget(pathname, "/resource-augmentation")) return "resource-augmentation";
  if (pathMatchesTarget(pathname, "/ai-automations")) return "ai-automations";
  if (pathMatchesTarget(pathname, "/digital-marketing")) return "digital-marketing";
  if (pathMatchesTarget(pathname, "/software-development")) return "software-development";
  return undefined;
}
