import { isValidCategory, getSubServices, type CategorySlug } from "@/lib/categories";
import {
  isValidAudience, isValidPricingMode, isValidOfferStatus, isValidOfferType, isValidPricingUnit, isValidOfferSegment,
  type Audience, type PricingMode, type OfferStatus, type OfferType, type PricingUnit, type OfferSegment, type LimitKind, type LinkedItem,
} from "@/lib/offers/constants";

export interface OfferPricingInput {
  mode: PricingMode;
  originalPrice?: number;
  currency?: string;
  percentage?: number;
  flatDiscountAmount?: number;
  maxDiscountCap?: number;
  startingPriceLabel?: string;
  /** What the price is per — package (default), hour, month or year. */
  unit?: PricingUnit;
}

export interface OfferWriteInput {
  campaignId: string;
  title: string;
  description?: string;
  badgeText?: string;
  category: CategorySlug;
  subService: string;
  audience: Audience[];
  pricing: OfferPricingInput;
  benefits: string[];
  /** Who the offer is for, in plain words (shown on the card and details sheet). */
  eligibility: string[];
  /** Marketplace tags — an offer can be several things at once (flash + student + course). */
  offerTypes: OfferType[];
  segment: OfferSegment;
  limitKind: LimitKind;
  /** The LMS course / service / product this offer is for. */
  linked: LinkedItem | null;
  /** Overrides the default "Claim Offer" button label. */
  ctaText?: string;
  /** Optional cap on total claims; drives the public progress bar and blocks claims once reached. */
  claimLimit: number | null;
  validFrom: string; // ISO
  validUntil: string; // ISO
  priority: number;
  isFeatured: boolean;
  isDealOfTheDay: boolean;
  isFlashDeal: boolean;
  status: OfferStatus;
}

export function validateOfferInput(
  input: Partial<OfferWriteInput>
): { valid: true; data: OfferWriteInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const campaignId = typeof input.campaignId === "string" ? input.campaignId.trim() : "";
  if (!campaignId) errors.campaignId = "A campaign is required.";

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) errors.title = "Title is required.";
  else if (title.length > 160) errors.title = "Title must be 160 characters or fewer.";

  const description = typeof input.description === "string" ? input.description.trim().slice(0, 1000) : undefined;
  const badgeText = typeof input.badgeText === "string" ? input.badgeText.trim().slice(0, 60) : undefined;

  if (!isValidCategory(String(input.category ?? ""))) {
    errors.category = "Choose a valid service category.";
  }
  const category = input.category as CategorySlug;

  const subService = typeof input.subService === "string" ? input.subService.trim() : "";
  if (!subService) {
    errors.subService = "Choose a sub-service, or \"all\" for the whole category.";
  } else if (subService !== "all" && category && isValidCategory(category)) {
    const valid = getSubServices(category).some((s) => s.slug === subService);
    if (!valid) errors.subService = "That sub-service doesn't belong to the chosen category.";
  }

  const audience = Array.isArray(input.audience) ? input.audience.filter(isValidAudience) : [];
  if (audience.length === 0) errors.audience = "Choose at least one audience.";

  if (!isValidPricingMode(input.pricing?.mode)) {
    errors.pricingMode = "Choose a valid pricing mode.";
  }
  const mode = input.pricing?.mode as PricingMode;

  const originalPrice = numOrUndefined(input.pricing?.originalPrice);
  const percentage = numOrUndefined(input.pricing?.percentage);
  const flatDiscountAmount = numOrUndefined(input.pricing?.flatDiscountAmount);
  const maxDiscountCap = numOrUndefined(input.pricing?.maxDiscountCap);
  const currency = typeof input.pricing?.currency === "string" ? input.pricing.currency.trim() || undefined : undefined;
  const startingPriceLabel = typeof input.pricing?.startingPriceLabel === "string" ? input.pricing.startingPriceLabel.trim().slice(0, 80) || undefined : undefined;

  if (mode === "percentage") {
    if (percentage === undefined || percentage <= 0 || percentage > 100) {
      errors.percentage = "Enter a percentage between 1 and 100.";
    }
  }
  if (mode === "flat") {
    if (flatDiscountAmount === undefined || flatDiscountAmount <= 0) {
      errors.flatDiscountAmount = "Enter a flat discount amount greater than 0.";
    }
  }
  if ((mode === "percentage" || mode === "flat") && (originalPrice === undefined || originalPrice <= 0)) {
    errors.originalPrice = "Enter the original price this discount applies to.";
  }

  const validFrom = typeof input.validFrom === "string" ? input.validFrom : "";
  const validUntil = typeof input.validUntil === "string" ? input.validUntil : "";
  const from = validFrom ? new Date(validFrom) : null;
  const until = validUntil ? new Date(validUntil) : null;
  if (!from || Number.isNaN(from.getTime())) errors.validFrom = "Enter a valid start date.";
  if (!until || Number.isNaN(until.getTime())) errors.validUntil = "Enter a valid end date.";
  if (from && until && !Number.isNaN(from.getTime()) && !Number.isNaN(until.getTime()) && from >= until) {
    errors.validUntil = "End date must be after the start date.";
  }

  const priority = typeof input.priority === "number" ? input.priority : Number(input.priority ?? 0);
  if (!Number.isFinite(priority) || priority < 0 || priority > 1000) {
    errors.priority = "Priority must be a number between 0 and 1000.";
  }

  if (!isValidOfferStatus(input.status)) errors.status = "Choose a valid status.";

  const benefits = Array.isArray(input.benefits)
    ? input.benefits.filter((b): b is string => typeof b === "string" && b.trim().length > 0).map((b) => b.trim().slice(0, 160)).slice(0, 12)
    : [];

  const eligibility = Array.isArray(input.eligibility)
    ? input.eligibility.filter((b): b is string => typeof b === "string" && b.trim().length > 0).map((b) => b.trim().slice(0, 160)).slice(0, 8)
    : [];

  const offerTypes = Array.isArray(input.offerTypes) ? Array.from(new Set(input.offerTypes.filter(isValidOfferType))) : [];
  const segment: OfferSegment = isValidOfferSegment(input.segment) ? input.segment : "any";
  const limitKind: LimitKind = input.limitKind === "quantity" ? "quantity" : "slots";
  const unit: PricingUnit = isValidPricingUnit(input.pricing?.unit) ? input.pricing!.unit! : "fixed";
  const ctaText = typeof input.ctaText === "string" ? input.ctaText.trim().slice(0, 40) || undefined : undefined;

  let linked: LinkedItem | null = null;
  if (input.linked && typeof input.linked === "object") {
    const l = input.linked as Partial<LinkedItem>;
    const label = typeof l.label === "string" ? l.label.trim().slice(0, 100) : "";
    const href = typeof l.href === "string" ? l.href.trim() : "";
    if (label || href) {
      if (!label) errors.linkedLabel = "Give the linked item a name.";
      else if (!/^\/[^\s]*$/.test(href) && !/^https:\/\/[^\s]+$/.test(href)) errors.linkedHref = "Use a site path like /industrial-training or a full https:// link.";
      else linked = { kind: ["course", "service", "product", "program"].includes(String(l.kind)) ? (l.kind as LinkedItem["kind"]) : "service", label, href };
    }
  }

  const rawLimit = numOrUndefined(input.claimLimit);
  if (rawLimit !== undefined && (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100000)) {
    errors.claimLimit = "Claim limit must be a whole number between 1 and 100000, or empty for unlimited.";
  }
  const claimLimit = rawLimit !== undefined && Number.isInteger(rawLimit) ? rawLimit : null;

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      campaignId,
      title,
      description,
      badgeText,
      category,
      subService,
      audience,
      pricing: { mode, originalPrice, currency, percentage, flatDiscountAmount, maxDiscountCap, startingPriceLabel, unit },
      benefits,
      eligibility,
      offerTypes,
      segment,
      limitKind,
      linked,
      ctaText,
      claimLimit,
      validFrom,
      validUntil,
      priority,
      isFeatured: Boolean(input.isFeatured),
      isDealOfTheDay: Boolean(input.isDealOfTheDay),
      isFlashDeal: Boolean(input.isFlashDeal),
      status: input.status as OfferStatus,
    },
  };
}

function numOrUndefined(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}
