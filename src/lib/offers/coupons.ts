import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/offers/db";
import type { ApplicableServiceInput, CouponWriteInput } from "@/lib/offers/coupon-validation";
import { normalizeCouponCode } from "@/lib/offers/coupon-validation";
import { audienceAliases, type Audience, type DiscountType } from "@/lib/offers/constants";
import type { CategorySlug } from "@/lib/categories";

export const COUPONS_COLLECTION = "coupons";
const CLAIMS_COLLECTION = "offer_claims"; // referenced by name only (see claims.ts) to avoid a circular import

export interface Coupon extends AuditFields {
  _id: string;
  code: string;
  campaignId?: string;
  discountType: DiscountType;
  discountAmount: number;
  maxDiscountCap?: number;
  minOrderValue?: number;
  applicableServices: ApplicableServiceInput[];
  applicableAudience: Audience[];
  startDate: Date;
  endDate: Date;
  usageLimit?: number;
  usageCount: number;
  perUserLimit?: number;
  isActive: boolean;
}

export interface SerializedCoupon extends Omit<Coupon, "createdAt" | "updatedAt" | "deletedAt" | "startDate" | "endDate"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  startDate: string;
  endDate: string;
}

export function serializeCoupon(c: Coupon): SerializedCoupon {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Coupon>(COUPONS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ code: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ campaignId: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getCoupon(id: string): Promise<Coupon | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface CouponFilter {
  search?: string;
  campaignId?: string;
}

function buildFilter(opts: CouponFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    filter.code = new RegExp(escapeRegExp(opts.search.trim().toUpperCase()), "i");
  }
  if (opts.campaignId) filter.campaignId = opts.campaignId;
  return filter;
}

export interface SearchCouponsOptions extends CouponFilter {
  page?: number;
  pageSize?: number;
}

export async function searchCoupons(opts: SearchCouponsOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createCoupon(data: CouponWriteInput, actorId: string): Promise<Coupon | { error: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ code: data.code, ...notDeleted });
  if (existing) return { error: "A coupon with this code already exists." };

  const doc: Coupon = {
    _id: newId(),
    code: data.code,
    campaignId: data.campaignId,
    discountType: data.discountType,
    discountAmount: data.discountAmount,
    maxDiscountCap: data.maxDiscountCap,
    minOrderValue: data.minOrderValue,
    applicableServices: data.applicableServices,
    applicableAudience: data.applicableAudience,
    startDate: new Date(data.startDate),
    endDate: new Date(data.endDate),
    usageLimit: data.usageLimit,
    usageCount: 0,
    perUserLimit: data.perUserLimit,
    isActive: data.isActive,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateCoupon(id: string, data: CouponWriteInput, actorId: string): Promise<Coupon | { error: string } | null> {
  const collection = await getCollection();
  const codeOwner = await collection.findOne({ code: data.code, _id: { $ne: id }, ...notDeleted });
  if (codeOwner) return { error: "A coupon with this code already exists." };

  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    {
      $set: {
        code: data.code,
        campaignId: data.campaignId,
        discountType: data.discountType,
        discountAmount: data.discountAmount,
        maxDiscountCap: data.maxDiscountCap,
        minOrderValue: data.minOrderValue,
        applicableServices: data.applicableServices,
        applicableAudience: data.applicableAudience,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        usageLimit: data.usageLimit,
        perUserLimit: data.perUserLimit,
        isActive: data.isActive,
        ...updateStamp(actorId),
      },
    },
    { returnDocument: "after" }
  );
}

export async function deleteCoupon(id: string, actorId: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}

// ---------------------------------------------------------------------------
// Runtime validation + redemption — always server-side, never trusts the client.
// ---------------------------------------------------------------------------

export interface CouponValidationContext {
  campaignId: string;
  category: CategorySlug;
  subService: string;
  audience: Audience;
  orderValue?: number;
  userEmail?: string;
}

export type CouponValidationResult =
  | { ok: true; coupon: Coupon; discountAmount: number }
  | { ok: false; error: string };

export async function validateCoupon(rawCode: string, ctx: CouponValidationContext): Promise<CouponValidationResult> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, error: "Enter a coupon code." };

  const collection = await getCollection();
  const coupon = await collection.findOne({ code, ...notDeleted });
  if (!coupon) return { ok: false, error: "Invalid coupon code." };
  if (!coupon.isActive) return { ok: false, error: "This coupon is no longer active." };

  const now = new Date();
  if (now < coupon.startDate || now > coupon.endDate) return { ok: false, error: "This coupon has expired." };

  if (coupon.campaignId && coupon.campaignId !== ctx.campaignId) {
    return { ok: false, error: "This coupon isn't valid for the current campaign." };
  }

  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
    return { ok: false, error: "This coupon has reached its usage limit." };
  }

  if (coupon.applicableAudience.length > 0 && !coupon.applicableAudience.includes("ALL") && !audienceAliases(ctx.audience).some((a) => coupon.applicableAudience.includes(a))) {
    return { ok: false, error: "This coupon isn't valid for your selection." };
  }

  if (coupon.applicableServices.length > 0) {
    const matches = coupon.applicableServices.some(
      (s) => s.category === ctx.category && (!s.subService || s.subService === ctx.subService)
    );
    if (!matches) return { ok: false, error: "This coupon doesn't apply to this service." };
  }

  if (coupon.minOrderValue != null && (ctx.orderValue == null || ctx.orderValue < coupon.minOrderValue)) {
    return { ok: false, error: `This coupon requires a minimum order value of ${coupon.minOrderValue}.` };
  }

  if (coupon.perUserLimit != null && ctx.userEmail) {
    const db = await getDb();
    const priorCount = await db
      .collection(CLAIMS_COLLECTION)
      .countDocuments({ couponCode: code, leadEmail: ctx.userEmail.trim().toLowerCase() });
    if (priorCount >= coupon.perUserLimit) {
      return { ok: false, error: "You've already used this coupon the maximum number of times." };
    }
  }

  const base = ctx.orderValue ?? 0;
  const raw = coupon.discountType === "percentage" ? base * (coupon.discountAmount / 100) : coupon.discountAmount;
  const discountAmount = coupon.maxDiscountCap != null ? Math.min(raw, coupon.maxDiscountCap) : raw;

  return { ok: true, coupon, discountAmount };
}

/** Race-safe usage-count increment. Only called on a final claim submit, never on the "Apply" preview. */
export async function redeemCoupon(couponId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = {
    _id: couponId,
    ...notDeleted,
    $or: [{ usageLimit: { $exists: false } }, { usageLimit: null }, { $expr: { $lt: ["$usageCount", "$usageLimit"] } }],
  };
  const result = await collection.findOneAndUpdate(
    filter,
    { $inc: { usageCount: 1 } },
    { returnDocument: "after" }
  );
  if (!result) return { ok: false, error: "This coupon just reached its usage limit. Please try again without it." };
  return { ok: true };
}
