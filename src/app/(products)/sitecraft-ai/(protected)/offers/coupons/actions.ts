"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLmsOrCms } from "@/lib/lms-auth";
import { validateCouponInput, type CouponWriteInput } from "@/lib/offers/coupon-validation";
import { createCoupon, updateCoupon, deleteCoupon, getCoupon } from "@/lib/offers/coupons";

async function requireLmsUser() {
  const u = await requireLmsOrCms("MANAGE_OFFERS", "PAGES_EDIT");
  if (!u) throw new Error("Forbidden");
  return u;
}

function touch() {
  revalidatePath("/sitecraft-ai/offers/coupons");
}

export async function saveCouponAction(
  id: string | null,
  input: Partial<CouponWriteInput>
): Promise<{ error?: string; fieldErrors?: Record<string, string> }> {
  const user = await requireLmsUser();
  const validation = validateCouponInput(input);
  if (!validation.valid) return { error: "Please fix the highlighted fields.", fieldErrors: validation.errors };

  const result = id ? await updateCoupon(id, validation.data, user.id) : await createCoupon(validation.data, user.id);
  if (result && "error" in result) return { error: result.error };
  if (id && !result) return { error: "Coupon not found." };

  touch();
  redirect("/sitecraft-ai/offers/coupons");
}

export async function deleteCouponAction(id: string): Promise<{ error?: string }> {
  const user = await requireLmsUser();
  const existing = await getCoupon(id);
  if (!existing) return { error: "Coupon not found." };
  await deleteCoupon(id, user.id);
  touch();
  return {};
}
