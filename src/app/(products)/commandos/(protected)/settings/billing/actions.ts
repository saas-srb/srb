"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import {
  cancelSubscription,
  changePlan,
  confirmCheckout,
  resumeSubscription,
  saveBillingDetails,
  priceSubscription,
  startCheckout,
  syncPaymentsFromRazorpay,
  type BillingActionResult,
  type CheckoutResponse,
  type StartCheckoutResult,
} from "@/lib/platform/billing/subscriptions";
import type { BillingDetails, BillingDetailsErrors, PriceSummary } from "@/lib/platform/billing/billing-details";
import type { BillingInterval } from "@/lib/platform/billing/types";

/** Directors of this company only — re-checked in every action. */
async function requireOwner(): Promise<{ companyId: string; userId: string }> {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
  return { companyId: await currentCompanyId(), userId: user.id };
}

function done<T extends { ok: boolean }>(res: T): T {
  if (res.ok) revalidatePath("/commandos/settings/billing");
  return res;
}

/** Price summary for the plan picker — priced only through quoteCheckout (plan, coupon, add-ons) + GST settings. */
export async function quoteAction(planId: string, interval: BillingInterval, couponCode: string | null): Promise<{ ok: true; summary: PriceSummary } | { ok: false; error: string }> {
  const { companyId } = await requireOwner();
  const res = await priceSubscription({ companyId, planId: String(planId ?? ""), interval, couponCode: couponCode ? String(couponCode).slice(0, 64) : null });
  return res.ok ? { ok: true, summary: res.summary } : res;
}

export async function saveBillingDetailsAction(input: Partial<BillingDetails>): Promise<{ ok: true; details: BillingDetails } | { ok: false; errors: BillingDetailsErrors }> {
  const { companyId, userId } = await requireOwner();
  return done(
    await saveBillingDetails(
      companyId,
      {
        legalName: input?.legalName,
        gstin: input?.gstin,
        address: input?.address,
        state: input?.state,
        email: input?.email,
      },
      userId,
    ),
  );
}

export async function startCheckoutAction(planId: string, interval: BillingInterval, couponCode: string | null, startNow = false): Promise<StartCheckoutResult> {
  const { companyId, userId } = await requireOwner();
  return startCheckout(companyId, { planId: String(planId ?? ""), interval, couponCode: couponCode ? String(couponCode).slice(0, 64) : null, startNow: startNow === true }, userId);
}

export async function confirmCheckoutAction(response: CheckoutResponse): Promise<BillingActionResult> {
  const { companyId, userId } = await requireOwner();
  return done(await confirmCheckout(companyId, response, userId));
}

export async function changePlanAction(planId: string, interval: BillingInterval, couponCode: string | null): Promise<BillingActionResult> {
  const { companyId, userId } = await requireOwner();
  return done(await changePlan(companyId, { planId: String(planId ?? ""), interval, couponCode: couponCode ? String(couponCode).slice(0, 64) : null }, userId, "subscription.change_plan", true));
}

/** "Missing a payment?": pulls the subscription's paid charges from Razorpay into the history. */
export async function syncTransactionsAction(): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { companyId } = await requireOwner();
  const res = await syncPaymentsFromRazorpay(companyId);
  if (!res.ok) return res;
  revalidatePath("/commandos/settings/billing/invoices");
  return { ok: true, message: res.found ? `Checked ${res.found} payment${res.found === 1 ? "" : "s"} with Razorpay. Your history is up to date.` : "No payments found for this subscription yet." };
}

export async function cancelSubscriptionAction(): Promise<BillingActionResult> {
  const { companyId, userId } = await requireOwner();
  // Companies cancel at period end (or, in the trial, drop the scheduled charge); immediate cancel is a Platform Console action.
  return done(await cancelSubscription(companyId, { when: "period_end" }, userId));
}

export async function resumeSubscriptionAction(): Promise<StartCheckoutResult> {
  const { companyId, userId } = await requireOwner();
  return resumeSubscription(companyId, userId);
}
