"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { saveCoupon, setCouponActive, type CouponInput, type CouponSaveResult } from "@/lib/platform/billing/coupons";

const nullableNumber = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export async function saveCouponAction(id: string | null, input: CouponInput): Promise<CouponSaveResult> {
  const user = await requirePlatformPermission("coupons.manage");
  const res = await saveCoupon(
    id ? String(id) : null,
    {
      code: String(input?.code ?? ""),
      description: String(input?.description ?? ""),
      kind: input?.kind === "fixed" ? "fixed" : "percent",
      percentOff: nullableNumber(input?.percentOff),
      amountOff: nullableNumber(input?.amountOff),
      plans: input?.plans === "all" ? "all" : Array.isArray(input?.plans) ? input.plans.map(String) : [],
      intervals: Array.isArray(input?.intervals) ? input.intervals : [],
      duration: input?.duration,
      durationCycles: nullableNumber(input?.durationCycles),
      validFrom: input?.validFrom ? String(input.validFrom) : null,
      validUntil: input?.validUntil ? String(input.validUntil) : null,
      maxRedemptions: nullableNumber(input?.maxRedemptions),
      maxPerCompany: nullableNumber(input?.maxPerCompany),
      firstTimeOnly: Boolean(input?.firstTimeOnly),
      active: Boolean(input?.active),
    },
    user.id,
  );
  if (res.ok) revalidatePath("/console/coupons", "layout");
  return res;
}

export async function setCouponActiveAction(id: string, active: boolean): Promise<{ ok: boolean }> {
  const user = await requirePlatformPermission("coupons.manage");
  const ok = await setCouponActive(String(id), Boolean(active), user.id);
  if (ok) revalidatePath("/console/coupons", "layout");
  return { ok };
}
