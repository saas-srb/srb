import { isValidCategory, type CategorySlug } from "@/lib/categories";
import { isValidAudience, isValidDiscountType, type Audience, type DiscountType } from "@/lib/offers/constants";

export interface ApplicableServiceInput {
  category: CategorySlug;
  subService?: string;
}

export interface CouponWriteInput {
  code: string;
  campaignId?: string;
  discountType: DiscountType;
  discountAmount: number;
  maxDiscountCap?: number;
  minOrderValue?: number;
  applicableServices: ApplicableServiceInput[];
  applicableAudience: Audience[];
  startDate: string; // ISO
  endDate: string; // ISO
  usageLimit?: number;
  perUserLimit?: number;
  isActive: boolean;
}

const CODE_RE = /^[A-Z0-9]{3,24}$/;

export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateCouponInput(
  input: Partial<CouponWriteInput>
): { valid: true; data: CouponWriteInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const code = typeof input.code === "string" ? normalizeCouponCode(input.code) : "";
  if (!code) errors.code = "Coupon code is required.";
  else if (!CODE_RE.test(code)) errors.code = "Code must be 3-24 uppercase letters/numbers, no spaces.";

  const campaignId = typeof input.campaignId === "string" && input.campaignId.trim() ? input.campaignId.trim() : undefined;

  if (!isValidDiscountType(input.discountType)) errors.discountType = "Choose a valid discount type.";
  const discountType = input.discountType as DiscountType;

  const discountAmount = numOrUndefined(input.discountAmount);
  if (discountAmount === undefined || discountAmount <= 0) {
    errors.discountAmount = "Enter a discount amount greater than 0.";
  } else if (discountType === "percentage" && discountAmount > 100) {
    errors.discountAmount = "Percentage discount cannot exceed 100.";
  }

  const maxDiscountCap = numOrUndefined(input.maxDiscountCap);
  const minOrderValue = numOrUndefined(input.minOrderValue);
  const usageLimit = numOrUndefined(input.usageLimit);
  const perUserLimit = numOrUndefined(input.perUserLimit);

  const applicableServices: ApplicableServiceInput[] = Array.isArray(input.applicableServices)
    ? input.applicableServices
        .filter((s): s is ApplicableServiceInput => !!s && isValidCategory(String(s.category)))
        .map((s) => ({ category: s.category, subService: s.subService?.trim() || undefined }))
    : [];

  const applicableAudience = Array.isArray(input.applicableAudience) ? input.applicableAudience.filter(isValidAudience) : [];
  if (applicableAudience.length === 0) errors.applicableAudience = "Choose at least one audience.";

  const startDate = typeof input.startDate === "string" ? input.startDate : "";
  const endDate = typeof input.endDate === "string" ? input.endDate : "";
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (!start || Number.isNaN(start.getTime())) errors.startDate = "Enter a valid start date.";
  if (!end || Number.isNaN(end.getTime())) errors.endDate = "Enter a valid end date.";
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start >= end) {
    errors.endDate = "End date must be after the start date.";
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      code,
      campaignId,
      discountType,
      discountAmount: discountAmount as number,
      maxDiscountCap,
      minOrderValue,
      applicableServices,
      applicableAudience,
      startDate,
      endDate,
      usageLimit,
      perUserLimit,
      isActive: Boolean(input.isActive ?? true),
    },
  };
}

function numOrUndefined(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}
