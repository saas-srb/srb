import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, type Company } from "@/lib/platform/tenancy/companies";
import { companyAppBaseUrl } from "@/lib/platform/tenancy/provisioning";
import { sendEmail } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { getPlan } from "@/lib/platform/billing/plans";
import { randomUUID } from "node:crypto";
import { quoteCheckout, type QuoteLine } from "@/lib/platform/billing/quote";
import { COUPON_REDEMPTIONS_COLLECTION, computeCouponDiscount, getCoupon, getRenewalRedemption, markRedemptionCycleBilled, redeemCoupon, releaseRedemption } from "@/lib/platform/billing/coupons";
import { currentPriceVersion, planPrice, planPriceAtVersion } from "@/lib/platform/billing/pricing";
import { DOWNGRADE_MESSAGE, downgradeGuarded, isPlanDowngrade } from "@/lib/platform/billing/plan-order-rule";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { recordSubscriptionEvent, type SubscriptionEventType } from "@/lib/platform/billing/events";
import { getCompanySubscription, updateCompanySubscription } from "@/lib/platform/billing/subscription";
import { recordTransaction } from "@/lib/platform/billing/transactions";
import { issueSaasInvoice, type IssueSaasInvoiceInput, type SaasInvoiceRef } from "@/lib/platform/billing/invoices";
import { taxTotals, validateBillingDetails, type BillingDetails, type BillingDetailsErrors, type PriceSummary } from "@/lib/platform/billing/billing-details";
import {
  RazorpayError,
  cancelRazorpaySubscription,
  cancelScheduledChanges,
  createCustomer,
  createSubscription,
  ensureRazorpayPlan,
  fetchInvoiceSubscriptionId,
  fetchSubscription,
  findPlanByRazorpayId,
  razorpayConfigured,
  razorpayKeyId,
  razorpayPlanAmount,
  refundPayment,
  fetchPayment,
  listSubscriptionInvoices,
  updateSubscriptionPlan,
  verifyCheckoutSignature,
  type RazorpayPayment,
  type RazorpaySubscription,
} from "@/lib/platform/billing/razorpay";
import { formatMoney, type BillingInterval, type CompanySubscription, type Plan, type SubscriptionPricing, type SubscriptionStatus } from "@/lib/platform/billing/types";

/**
 * Paid subscriptions through Razorpay (the platform owner's own account,
 * configured in the Platform Console → Payments & Razorpay).
 *
 *  pricing    every amount comes from `quoteCheckout()` (plan + coupon +
 *             add-ons) plus GST from the billing settings. The quote is stored
 *             on the subscription (`pricing`) and a Razorpay plan is created
 *             for that exact tax-inclusive amount (`ensureRazorpayPlan`), so
 *             a coupon discount is charged every cycle it applies to. A
 *             limited coupon (once / N cycles) is ended by `repriceSubscription`
 *             after its last discounted charge: the subscription is scheduled
 *             onto the full-price Razorpay plan at cycle end. The same function
 *             re-prices after an add-on change. A plan price edit never changes
 *             what an existing subscriber pays (`priceVersion`).
 *  checkout   startCheckout → Razorpay Checkout in the browser → confirmCheckout
 *             (signature-verified; the subscription is re-fetched from Razorpay,
 *             never taken from the browser). A company still in its trial is
 *             charged when the trial ends (`start_at`).
 *  renewals   the webhook (`handleWebhook`) — activated/charged → active + new
 *             period + SaaS invoice; pending / payment.failed → past_due;
 *             halted → grace (settings.billing.graceDays); cancelled /
 *             completed → canceled; a charge after past_due/grace/suspended →
 *             reactivated.
 *  dunning    `runDunningSweep` (daily cron): grace → suspended when grace
 *             ends; past_due → grace as a backstop if Razorpay never halts;
 *             expired trials → suspended; missed renewals reconciled.
 *  changes    changePlan: an UPGRADE (higher monthly-normalised pre-tax price)
 *             switches the Razorpay plan immediately — Razorpay starts a new
 *             cycle and charges the new plan in full — and we refund the
 *             unused part of the last payment pro rata (best effort; a failed
 *             refund is audited for a manual refund). A DOWNGRADE (or same
 *             price, e.g. interval switch) is scheduled for the end of the
 *             current cycle (`pendingChange`). During the trial nothing has
 *             been charged, so any change applies at once.
 *             cancelSubscription (at period end / now), resume (a new
 *             subscription starting when the current period ends — Razorpay
 *             can't un-cancel).
 *
 * Every status or plan transition goes through `applyChange`, which writes
 * the subscription, appends a `subscription_events` row and a platform audit
 * entry. The platform owner is never billed.
 */

/** Backstop only — Razorpay's own retry schedule normally ends in `subscription.halted` well before this. */
export const PAST_DUE_BACKSTOP_DAYS = 10;
/** A trial whose first charge is scheduled gets this long after trial end before it's suspended (charge in flight). */
const TRIAL_CHARGE_WAIT_MS = 2 * 86_400_000;
const DAY_MS = 86_400_000;
/** Smallest pro-rata refund worth issuing (smallest currency unit). */
const MIN_REFUND = 100;

/** `checkout` is set when the change needs the customer to approve a payment again (a UPI subscription can't be edited, so the new plan is a new subscription). */
/** Whether moving to `targetPlanId` would be a step DOWN from the plan the company is on (not allowed for the company itself; the Platform Console can still do it). */
async function downgradeBlock(sub: CompanySubscription, targetPlanId: string): Promise<string | null> {
  if (!downgradeGuarded(sub.status) || sub.planId === targetPlanId) return null;
  const [current, target] = await Promise.all([getPlan(sub.planId), getPlan(targetPlanId)]);
  if (!current || !target) return null;
  const monthly = (p: Plan) => (p.contactSales ? null : p.lifetimeFree ? 0 : planPrice(p, "monthly"));
  return isPlanDowngrade(monthly(current), monthly(target)) ? DOWNGRADE_MESSAGE : null;
}

export type BillingActionResult = { ok: true; message?: string; checkout?: CheckoutPayload } | { ok: false; error: string };

export interface CheckoutPayload {
  key: string;
  subscriptionId: string;
  name: string;
  description: string;
  /** Tax-inclusive, smallest currency unit — the Razorpay plan amount. */
  amount: number;
  currency: string;
  prefill: { name: string; email: string };
  /** First charge date (ISO) when the charge waits for the trial / current period to end. */
  startsAt: string | null;
}

export type StartCheckoutResult = { ok: true; checkout: CheckoutPayload } | { ok: false; error: string };

export interface CheckoutResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

type CompanyDoc = Company & { subscription?: CompanySubscription };

async function companies() {
  return (await getPlatformDb()).collection<CompanyDoc>(COMPANIES_COLLECTION);
}

// ── Test seam: the invoices workstream implements issueSaasInvoice ─────────────

let invoiceIssuer: (input: IssueSaasInvoiceInput) => Promise<SaasInvoiceRef | null> = issueSaasInvoice;
/** Tests only: observe invoice issuing. */
export function __setInvoiceIssuerForTests(fn: typeof invoiceIssuer | null): void {
  invoiceIssuer = fn ?? issueSaasInvoice;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const LIVE_STATUSES = new Set<SubscriptionStatus>(["trialing", "active", "past_due"]);

/**
 * A Razorpay subscription is attached, still running and not scheduled to end
 * — change it rather than start another. (A halted one — grace — is not live:
 * the company pays again through a fresh checkout.)
 */
export function hasLiveSubscription(sub: CompanySubscription | null): boolean {
  return Boolean(sub?.provider?.subscriptionId) && LIVE_STATUSES.has(sub!.status) && !sub!.cancelAtPeriodEnd;
}

function fromUnix(s: number | null | undefined): Date | null {
  return typeof s === "number" && s > 0 ? new Date(s * 1000) : null;
}

function noteOf(entity: Pick<RazorpaySubscription, "notes">, key: string): string | null {
  const notes = entity.notes;
  if (!notes || Array.isArray(notes)) return null;
  const v = notes[key];
  return typeof v === "string" && v ? v : null;
}

export function isInterval(v: unknown): v is BillingInterval {
  return v === "monthly" || v === "yearly";
}

function friendly(err: unknown, fallback: string): string {
  if (err instanceof RazorpayError) {
    console.error("[billing] Razorpay error", err.status, err.code, err.message);
    return err.code === "NOT_CONFIGURED" ? "Online billing isn't configured yet. Please contact support." : `${fallback} Razorpay said: ${err.message}`;
  }
  console.error("[billing]", err);
  return fallback;
}

function fmtDate(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";
}

/** Monthly-normalised pre-tax amount (yearly / 12). */
export function monthlyOf(net: number, interval: BillingInterval): number {
  return interval === "yearly" ? Math.round(net / 12) : net;
}

async function graceDays(): Promise<number> {
  return (await getBillingSettings()).billing.graceDays;
}

/** Which of our plans a Razorpay subscription is for: its Razorpay plan id first, else our own notes. */
async function resolvePlan(entity: Pick<RazorpaySubscription, "plan_id" | "notes">): Promise<{ planId: string; interval: BillingInterval } | null> {
  const byPlanId = await findPlanByRazorpayId(entity.plan_id);
  if (byPlanId) return { planId: byPlanId.plan._id, interval: byPlanId.interval };
  const planId = noteOf(entity, "planId");
  const interval = noteOf(entity, "interval");
  return planId && isInterval(interval) ? { planId, interval } : null;
}

// ── Pricing (quoteCheckout only) ───────────────────────────────────────────────

export type PricingResult = { ok: true; pricing: SubscriptionPricing; summary: PriceSummary } | { ok: false; error: string };

/**
 * Prices a plan for a company through `quoteCheckout` and adds GST from the
 * billing settings. The only way this module turns a plan into an amount.
 */
export async function priceSubscription(input: {
  companyId: string;
  planId: string;
  interval: BillingInterval;
  couponCode?: string | null;
  /** Keep the plan line at this price version (an existing subscriber being re-priced); omitted = current catalogue price. */
  priceVersion?: number | null;
}): Promise<PricingResult> {
  if (!isInterval(input.interval)) return { ok: false, error: "Choose monthly or yearly billing." };
  const couponCode = input.couponCode?.trim().toUpperCase() || null;
  const [quote, plan, settings] = await Promise.all([
    quoteCheckout({ planId: String(input.planId ?? ""), interval: input.interval, companyId: input.companyId, couponCode }),
    getPlan(String(input.planId ?? "")),
    getBillingSettings(),
  ]);
  if (!quote || !plan || (!plan.active && !input.priceVersion)) return { ok: false, error: "That plan isn't available." };
  if (plan.contactSales) return { ok: false, error: `${plan.name} is arranged with our team. Please contact support.` };
  if (plan.lifetimeFree) return { ok: false, error: `${plan.name} is free for life and needs no payment.` };
  let priceVersion = currentPriceVersion(plan);
  if (input.priceVersion && input.priceVersion !== priceVersion) {
    // Grandfathered subscriber: the plan line stays at the version they bought; the discount is re-worked on the new subtotal.
    const planLine = quote.lines.find((l) => l.kind === "plan");
    const old = planPriceAtVersion(plan, quote.interval, input.priceVersion);
    if (planLine && old !== null) {
      planLine.amount = old;
      priceVersion = input.priceVersion;
      quote.subtotal = quote.lines.filter((l) => l.kind !== "discount").reduce((sum, l) => sum + l.amount, 0);
      const discountLine = quote.lines.find((l) => l.kind === "discount");
      const coupon = quote.couponId ? await getCoupon(quote.couponId) : null;
      quote.discount = coupon ? computeCouponDiscount(coupon, quote.subtotal) : 0;
      if (discountLine) discountLine.amount = -quote.discount;
      quote.taxable = quote.subtotal - quote.discount;
    }
  }
  const { net, gst, total } = taxTotals(quote.taxable, quote.gstRatePercent, settings.tax.pricesIncludeTax);
  if (!Number.isInteger(total) || total <= 0) return { ok: false, error: "That plan has no price for this billing period yet." };
  const pricing: SubscriptionPricing = {
    planId: quote.planId,
    interval: quote.interval,
    currency: quote.currency,
    couponCode: quote.couponId ? couponCode : null,
    couponId: quote.couponId,
    subtotal: quote.subtotal,
    discount: quote.discount,
    net,
    gst,
    gstRatePercent: quote.gstRatePercent,
    total,
    quotedAt: new Date(),
    lines: quote.lines.map((l) => ({ kind: l.kind, refId: l.refId, label: l.label, amount: l.amount })),
    redemptionId: null,
    priceVersion,
  };
  const summary: PriceSummary = {
    planId: plan._id,
    planName: plan.name,
    interval: quote.interval,
    currency: quote.currency,
    lines: quote.lines.map((l) => ({ kind: l.kind, label: l.label, amount: l.amount })),
    subtotal: quote.subtotal,
    discount: quote.discount,
    net,
    gst,
    gstRatePercent: quote.gstRatePercent,
    pricesIncludeTax: settings.tax.pricesIncludeTax,
    total,
    couponCode,
    couponApplied: Boolean(quote.couponId),
    couponError: quote.couponError,
  };
  return { ok: true, pricing, summary };
}

/** The pricing that applies to a subscription's current plan, when one was stored for it. */
function currentPricing(sub: Pick<CompanySubscription, "planId" | "interval" | "pricing">): SubscriptionPricing | null {
  const p = sub.pricing;
  return p && p.planId === sub.planId && p.interval === sub.interval ? p : null;
}

/** MRR (pre-tax, monthly-normalised) of a subscription as stored; 0 when not paying. */
export async function subscriptionMrr(sub: CompanySubscription): Promise<number> {
  if (!["active", "past_due", "grace"].includes(sub.status)) return 0;
  const pricing = currentPricing(sub);
  if (pricing) return monthlyOf(pricing.net, sub.interval);
  const plan = await getPlan(sub.planId);
  if (!plan) return 0;
  return monthlyOf(planPriceAtVersion(plan, sub.interval, sub.priceVersion) ?? 0, sub.interval);
}

// ── Transitions (history + audit) ──────────────────────────────────────────────

const PAYING_EVENTS = new Set<SubscriptionEventType>(["activated", "reactivated", "plan_changed", "past_due", "grace"]);

/** The subscription event a change amounts to, or null when neither status nor plan changed. */
export function eventTypeFor(before: CompanySubscription, after: CompanySubscription): SubscriptionEventType | null {
  if (before.status !== after.status) {
    switch (after.status) {
      case "active":
        return ["past_due", "grace", "suspended", "canceled"].includes(before.status) ? "reactivated" : "activated";
      case "trialing":
        return "trial_started";
      case "past_due":
      case "grace":
      case "suspended":
      case "canceled":
        return after.status;
      case "internal":
        return "plan_changed";
    }
  }
  if (before.planId !== after.planId || before.interval !== after.interval) return "plan_changed";
  return null;
}

interface ChangeOptions {
  /** admin_users id, or "system" for webhooks and crons. */
  actorId: string;
  /** Audit verb, e.g. "subscription.webhook.charged", "subscription.admin.extend_trial". */
  action: string;
  /** Idempotency key for the subscription event (e.g. the webhook event id). */
  key?: string;
  details?: Record<string, unknown>;
}

/**
 * Writes a subscription change, then records the subscription event (on a
 * status/plan transition) and a platform audit entry. Returns the new state.
 */
export async function applyChange(companyId: string, before: CompanySubscription, patch: Partial<CompanySubscription>, opts: ChangeOptions): Promise<CompanySubscription> {
  await updateCompanySubscription(companyId, patch);
  const after = (await getCompanySubscription(companyId)) ?? { ...before, ...patch };
  const type = eventTypeFor(before, after);
  if (type) {
    const pricing = currentPricing(after);
    const mrr = after.status === "internal" ? 0 : PAYING_EVENTS.has(type) && pricing && after.status !== "trialing" ? monthlyOf(pricing.net, after.interval) : undefined;
    await recordSubscriptionEvent({ companyId, type, planId: after.status === "internal" ? null : after.planId, interval: after.interval, mrr, key: opts.key ? `${opts.key}:${type}` : undefined });
  }
  await recordPlatformAudit({
    actorId: opts.actorId,
    action: opts.action,
    target: { type: "subscription", id: companyId },
    companyId,
    details: {
      ...(before.status !== after.status ? { status: `${before.status} → ${after.status}` } : { status: after.status }),
      ...(before.planId !== after.planId || before.interval !== after.interval ? { plan: `${before.planId}/${before.interval} → ${after.planId}/${after.interval}` } : {}),
      ...(type ? { event: type } : {}),
      ...opts.details,
    },
  });
  return after;
}

// ── Notifications ──────────────────────────────────────────────────────────────

async function billingRecipient(companyId: string, sub: CompanySubscription | null): Promise<string | null> {
  if (sub?.billingDetails?.email) return sub.billingDetails.email;
  const owner = await (await getPlatformDb())
    .collection<{ companyId: string; email: string; roles: string[]; createdAt: Date }>("admin_users")
    .findOne({ companyId, roles: "super_admin" }, { sort: { createdAt: 1, _id: 1 }, projection: { email: 1 } });
  return owner?.email ?? null;
}

type NoticeKind = "payment_failed" | "grace" | "suspended" | "trial_ended" | "canceled";

/** Billing emails to the company's billing contact (or first Director). Never throws. */
async function notify(companyId: string, kind: NoticeKind): Promise<void> {
  try {
    const company = await (await companies()).findOne({ _id: companyId }, { projection: { name: 1, slug: 1, subscription: 1 } });
    if (!company) return;
    const sub = company.subscription ?? null;
    const to = await billingRecipient(companyId, sub);
    if (!to) return;
    const plan = sub ? await getPlan(sub.planId) : null;
    const planName = plan?.name ?? "your plan";
    const url = `${companyAppBaseUrl(company.slug)}/commandos/settings/billing`;
    const copy: Record<NoticeKind, { subject: string; heading: string; paragraphs: string[]; label: string }> = {
      payment_failed: {
        subject: `Payment failed for ${company.name}`,
        heading: "We couldn't collect your subscription payment",
        paragraphs: [`The renewal payment for ${company.name} (${planName}) didn't go through. Razorpay will retry automatically over the next few days.`, "Please make sure your card or UPI mandate has funds, or update your payment method, to avoid interruption."],
        label: "Review billing",
      },
      grace: {
        subject: `Action needed: ${company.name} subscription in grace period`,
        heading: "Your subscription payment is overdue",
        paragraphs: [`We couldn't collect payment for ${company.name}. Your workspace keeps working until ${fmtDate(sub?.graceEndsAt)}, after which it becomes read-only.`, "Renew your subscription from the billing page to keep full access."],
        label: "Renew subscription",
      },
      suspended: {
        subject: `${company.name} is now read-only`,
        heading: "Your workspace is read-only",
        paragraphs: [`We didn't receive payment for ${company.name}, so the workspace is now read-only. Your data is safe.`, "Subscribe again from the billing page to restore full access."],
        label: "Restore access",
      },
      trial_ended: {
        subject: `Your ${company.name} trial has ended`,
        heading: "Your free trial has ended",
        paragraphs: [`The trial for ${company.name} is over and the workspace is now read-only. Your data is safe.`, "Choose a plan to restore full access."],
        label: "Choose a plan",
      },
      canceled: {
        subject: `${company.name} subscription canceled`,
        heading: "Your subscription has ended",
        paragraphs: [`The ${planName} subscription for ${company.name} has ended and the workspace is now read-only. Your data is safe.`, "You can subscribe again at any time."],
        label: "Subscribe again",
      },
    };
    const c = copy[kind];
    const { html, text } = renderEmail({ brand: company.name, heading: c.heading, paragraphs: c.paragraphs, action: { label: c.label, url } });
    await sendEmail({ to, subject: c.subject, html, text, event: "billing_subscription", companyId });
  } catch (err) {
    console.error(`[billing] ${kind} email failed for ${companyId}`, err);
  }
}

// ── Invoices & adoption ──────────────────────────────────────────────────────

/**
 * Issues the SaaS invoice for one successful charge via `issueSaasInvoice`
 * (idempotent on the payment id). Lines are the stored quote's lines (plan,
 * add-ons, discount) when the captured amount is that quote's total; otherwise
 * one plan line worked back from the captured amount (GST backed out when
 * prices exclude tax).
 *
 * Never throws: a failed invoice must not make Razorpay redeliver the charge
 * forever. The failure is audited ("invoice.issue_failed") for the owner to
 * issue it by hand; a total that differs from the payment is audited too.
 */
async function issueInvoice(companyId: string, entity: RazorpaySubscription, payment: { id: string; amount: number; currency: string }, sub: CompanySubscription): Promise<SaasInvoiceRef | null> {
  try {
    const resolved = await resolvePlan(entity);
    const planId = resolved?.planId ?? sub.planId;
    const interval = resolved?.interval ?? sub.interval;
    const start = fromUnix(entity.current_start) ?? new Date();
    const end = fromUnix(entity.current_end) ?? new Date(start.getTime() + (interval === "yearly" ? 365 : 30) * DAY_MS);
    const pricing = sub.pricing && sub.pricing.total === payment.amount && sub.pricing.lines?.length ? sub.pricing : null;
    let lines: QuoteLine[];
    if (pricing) lines = pricing.lines!.map((l) => ({ ...l }));
    else {
      const [plan, settings] = await Promise.all([getPlan(planId), getBillingSettings()]);
      const rate = sub.pricing?.gstRatePercent ?? settings.tax.gstRatePercent;
      const amount = settings.tax.pricesIncludeTax ? payment.amount : Math.round((payment.amount * 100) / (100 + rate));
      lines = [{ kind: "plan", refId: planId, label: `${plan?.name ?? planId} (${interval})`, amount }];
    }
    const invoice = await invoiceIssuer({ companyId, lines, planId, interval, period: { start, end }, paymentRef: payment.id, paidAt: new Date(), actorId: "system" });
    if (invoice && invoice.total !== payment.amount) {
      await recordPlatformAudit({ actorId: "system", action: "invoice.total_mismatch", target: { type: "saas_invoice", id: invoice.id }, companyId, details: { paymentId: payment.id, charged: payment.amount, invoiceTotal: invoice.total, number: invoice.number } });
    }
    return invoice;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[billing] invoice for ${payment.id} failed`, err);
    await recordPlatformAudit({ actorId: "system", action: "invoice.issue_failed", target: { type: "subscription", id: companyId }, companyId, details: { paymentId: payment.id, amount: payment.amount, message: message.slice(0, 500) } });
    return null;
  }
}

/** One successful charge, written to the payments ledger (with its invoice, once there is one). Never throws. */
async function ledgerPayment(companyId: string, entity: RazorpaySubscription, payment: { id: string; amount: number; currency: string; method?: string | null }, sub: CompanySubscription, invoice: SaasInvoiceRef | null): Promise<void> {
  try {
    const resolved = await resolvePlan(entity);
    const planId = resolved?.planId ?? sub.planId;
    const interval = resolved?.interval ?? sub.interval;
    const plan = await getPlan(planId);
    await recordTransaction({
      companyId,
      type: "payment",
      amount: payment.amount,
      currency: payment.currency,
      paymentId: payment.id,
      description: `${plan?.name ?? planId} plan · ${interval === "yearly" ? "yearly" : "monthly"} subscription`,
      method: payment.method ?? null,
      planId,
      planName: plan?.name ?? null,
      interval,
      subscriptionId: entity.id,
      invoiceId: invoice?.id ?? null,
      invoiceNumber: invoice?.number ?? null,
      payer: sub.billingDetails ? { name: sub.billingDetails.legalName, email: sub.billingDetails.email, gstin: sub.billingDetails.gstin } : null,
    });
  } catch (err) {
    console.error("[billing] ledger entry failed", payment.id, err);
  }
}

/** Status/period patch for a Razorpay subscription state. */
async function patchFromEntity(current: CompanySubscription, entity: RazorpaySubscription): Promise<Partial<CompanySubscription>> {
  const start = fromUnix(entity.current_start);
  const end = fromUnix(entity.current_end);
  const period = end && (!current.currentPeriodEnd || end.getTime() >= current.currentPeriodEnd.getTime()) ? { currentPeriodStart: start, currentPeriodEnd: end } : {};
  switch (entity.status) {
    case "active":
      return { status: "active", graceEndsAt: null, dunning: null, ...period };
    case "pending":
      return current.status === "active" || current.status === "trialing" ? { status: "past_due", dunning: { failedPayments: current.dunning?.failedPayments ?? 0, pastDueSince: current.dunning?.pastDueSince ?? new Date() } } : {};
    case "halted":
      return current.status === "grace" || current.status === "suspended" ? {} : { status: "grace", graceEndsAt: new Date(Date.now() + (await graceDays()) * DAY_MS) };
    case "cancelled":
    case "completed":
    case "expired":
      return { status: "canceled", cancelAtPeriodEnd: false, pendingChange: null, graceEndsAt: null };
    default:
      // created / authenticated (first charge still scheduled) / paused: status unchanged.
      return {};
  }
}

/**
 * Makes a (signature-verified) Razorpay subscription the company's current
 * one: provider ids, plan, pricing, status and period. A previous live
 * subscription is canceled at Razorpay (one scheduled to end is left to end).
 */
async function adoptSubscription(companyId: string, entity: RazorpaySubscription, opts: ChangeOptions): Promise<CompanySubscription | null> {
  const current = await getCompanySubscription(companyId);
  if (!current || current.status === "internal") return null;
  const resolved = await resolvePlan(entity);
  const previous = current.provider?.subscriptionId ?? null;
  const checkoutPricing = current.checkout;
  const pricing = checkoutPricing?.subscriptionId === entity.id ? checkoutPricing.pricing : current.pricing;
  const patch: Partial<CompanySubscription> = {
    provider: { id: "razorpay", subscriptionId: entity.id, customerId: entity.customer_id ?? current.provider?.customerId ?? null },
    cancelAtPeriodEnd: false,
    pendingChange: null,
    pricing: pricing ?? null,
    ...(pricing?.priceVersion ? { priceVersion: pricing.priceVersion } : {}),
    // Paying for the plan ends the free trial.
    ...(entity.status === "active" ? { trialEndsAt: null } : {}),
    ...(resolved ?? {}),
    ...(await patchFromEntity(current, entity)),
  };
  if (checkoutPricing?.subscriptionId === entity.id) patch.checkout = null;
  // A UPI plan switch: the unused part of the last payment on the old plan is refunded (best effort, audited) once the new one is active.
  const refund = checkoutPricing?.subscriptionId === entity.id && checkoutPricing.replaces && entity.status === "active" && previous && previous !== entity.id ? await refundUnused(companyId, current, opts.actorId ?? "system") : null;
  const after = await applyChange(companyId, current, patch, { ...opts, details: { ...opts.details, subscriptionId: entity.id, ...(refund ? { refund } : {}) } });
  if (previous && previous !== entity.id && !current.cancelAtPeriodEnd) {
    await cancelRazorpaySubscription(previous, false).catch((err) => console.warn(`[billing] couldn't cancel replaced subscription ${previous}`, err instanceof Error ? err.message : err));
  }
  return after;
}

/** When the first charge of a new subscription should happen: at trial end / after an already-paid period, else now. */
function checkoutStartAt(sub: CompanySubscription, now: number): Date | null {
  const until = sub.status === "trialing" ? sub.trialEndsAt : sub.status === "active" && sub.cancelAtPeriodEnd ? sub.currentPeriodEnd : null;
  if (!until) return null;
  // Charge an hour early so access never lapses while the charge is processed.
  const at = until.getTime() - 3_600_000;
  return at > now + 15 * 60_000 ? new Date(at) : null;
}

function notBilled(sub: CompanySubscription | null): string | null {
  if (!sub) return "Unknown workspace.";
  if (sub.status === "internal") return sub.complimentary ? "This workspace is complimentary — there's nothing to pay." : "The platform owner's workspace isn't billed.";
  return null;
}

// ── Coupons (contract in coupons.ts) ───────────────────────────────────────────

/**
 * Claims the quote's coupon for the company BEFORE anything is created at
 * Razorpay, and writes the redemption id into the pricing snapshot. A live
 * redemption of the same coupon (a discount still running, or a checkout being
 * retried) is reused rather than redeemed twice. `fresh` = this call created
 * it, so a failure right after must release it.
 */
async function attachCoupon(companyId: string, pricing: SubscriptionPricing, actorId: string): Promise<{ ok: true; fresh: boolean } | { ok: false; error: string }> {
  if (!pricing.couponId) return { ok: true, fresh: false };
  const live = await getRenewalRedemption(companyId);
  if (live && live.couponId === pricing.couponId) {
    pricing.redemptionId = live._id;
    return { ok: true, fresh: false };
  }
  const r = await redeemCoupon({ couponId: pricing.couponId, companyId, planId: pricing.planId, interval: pricing.interval, discount: pricing.discount, reference: `checkout_${randomUUID()}`, actorId });
  if (!r.ok) return r;
  pricing.redemptionId = r.redemptionId;
  return { ok: true, fresh: !r.alreadyRedeemed };
}

/**
 * Gives back a redemption that was never billed (abandoned / replaced
 * checkout, first payment failed). One that has been charged at least once
 * has been used and stays.
 */
async function releaseUnused(companyId: string, redemptionId: string | null | undefined, reason: string, keepRedemptionId: string | null = null): Promise<boolean> {
  if (!redemptionId || redemptionId === keepRedemptionId) return false;
  try {
    // Read-only peek at the redemption (owned by coupons.ts) to see whether it was ever billed.
    const doc = await (await getPlatformDb()).collection<{ _id: string; companyId: string; status: string; cyclesBilled: number }>(COUPON_REDEMPTIONS_COLLECTION).findOne({ _id: redemptionId, companyId });
    if (!doc || doc.status !== "redeemed" || doc.cyclesBilled > 0) return false;
    return await releaseRedemption({ redemptionId, reason });
  } catch (err) {
    console.error("[billing] releaseRedemption failed", err);
    return false;
  }
}

// ── Billing details ──────────────────────────────────────────────────────────

export async function saveBillingDetails(companyId: string, input: Partial<Record<keyof BillingDetails, unknown>>, actorId = "system"): Promise<{ ok: true; details: BillingDetails } | { ok: false; errors: BillingDetailsErrors }> {
  const sub = await getCompanySubscription(companyId);
  if (!sub || (sub.status === "internal" && !sub.complimentary)) return { ok: false, errors: { legalName: "The platform owner's workspace isn't billed." } };
  const res = validateBillingDetails(input);
  if (!res.ok) return res;
  await updateCompanySubscription(companyId, { billingDetails: res.value });
  await recordPlatformAudit({ actorId, action: "subscription.billing_details.update", target: { type: "subscription", id: companyId }, companyId, details: { state: res.value.state, hasGstin: Boolean(res.value.gstin) } });
  return { ok: true, details: res.value };
}

// ── Checkout ─────────────────────────────────────────────────────────────────

export async function startCheckout(companyId: string, input: { planId: string; interval: BillingInterval; couponCode?: string | null; replaceLive?: boolean; /** During a free trial: pay and start the paid plan today instead of when the trial ends. */ startNow?: boolean }, actorId = "system"): Promise<StartCheckoutResult> {
  if (!(await razorpayConfigured())) return { ok: false, error: "Online billing isn't configured yet. Please contact support." };
  const company = await (await companies()).findOne({ _id: companyId }, { projection: { name: 1, slug: 1, isPlatformOwner: 1 } });
  if (!company) return { ok: false, error: "Unknown workspace." };
  const sub = await getCompanySubscription(companyId);
  const blocked = company.isPlatformOwner ? "The platform owner's workspace isn't billed." : notBilled(sub);
  if (blocked || !sub) return { ok: false, error: blocked ?? "Unknown workspace." };
  const lower = await downgradeBlock(sub, input.planId);
  if (lower) return { ok: false, error: lower };
  const replacing = input.replaceLive === true && hasLiveSubscription(sub);
  if (hasLiveSubscription(sub) && !replacing) return { ok: false, error: "You already have a subscription — change your plan instead." };
  const priced = await priceSubscription({ companyId, planId: input.planId, interval: input.interval, couponCode: input.couponCode });
  if (!priced.ok) return priced;
  if (input.couponCode?.trim() && priced.summary.couponError) return { ok: false, error: priced.summary.couponError };
  const { pricing } = priced;
  const details = sub.billingDetails;
  if (!details) return { ok: false, error: "Add your billing details before subscribing — they go on your GST invoices." };
  const plan = (await getPlan(pricing.planId))!;

  // A previous checkout that was never paid is replaced: give its coupon back (the same coupon is reused below instead).
  if (sub.checkout && sub.checkout.pricing.couponId !== pricing.couponId) await releaseUnused(companyId, sub.checkout.pricing.redemptionId, "checkout_replaced");
  // Coupon: claimed before anything exists at Razorpay; released again if the subscription can't be created.
  const coupon = await attachCoupon(companyId, pricing, actorId);
  if (!coupon.ok) return coupon;

  try {
    let customerId = sub.provider?.customerId ?? null;
    if (!customerId) {
      customerId = (await createCustomer({ name: details.legalName, email: details.email, gstin: details.gstin, notes: { companyId } })).id;
      await updateCompanySubscription(companyId, { provider: { id: "razorpay", subscriptionId: sub.provider?.subscriptionId ?? null, customerId } });
    }
    const razorpayPlanId = await ensureRazorpayPlan(plan, pricing.interval, pricing.total, pricing.currency);
    // A trial normally rolls into the paid plan when it ends; "start now" charges today (the trial ends with the payment).
    const startsAt = input.startNow ? null : checkoutStartAt(sub, Date.now());
    const created = await createSubscription({
      planId: razorpayPlanId,
      customerId,
      interval: pricing.interval,
      startAt: startsAt ? Math.floor(startsAt.getTime() / 1000) : null,
      // Set by us and read back from Razorpay on confirm/webhook — never from the browser.
      notes: { companyId, planId: plan._id, interval: pricing.interval, purpose: "platform_subscription", ...(pricing.couponId ? { couponId: pricing.couponId } : {}), ...(pricing.redemptionId ? { redemptionId: pricing.redemptionId } : {}) },
    });
    // Remembered until Razorpay confirms this subscription, so the confirmed one carries its quote.
    await updateCompanySubscription(companyId, { checkout: { subscriptionId: created.id, pricing, ...(replacing ? { replaces: true } : {}) } });
    await recordPlatformAudit({
      actorId,
      action: "subscription.checkout.start",
      target: { type: "subscription", id: companyId },
      companyId,
      details: { planId: plan._id, interval: pricing.interval, total: pricing.total, couponId: pricing.couponId, subscriptionId: created.id },
    });
    return {
      ok: true,
      checkout: {
        key: await razorpayKeyId(),
        subscriptionId: created.id,
        name: company.name,
        description: `${plan.name} plan · ${pricing.interval} · ${formatMoney(pricing.total, pricing.currency)} incl. ${pricing.gstRatePercent}% GST`,
        amount: pricing.total,
        currency: pricing.currency,
        prefill: { name: details.legalName, email: details.email },
        startsAt: startsAt?.toISOString() ?? null,
      },
    };
  } catch (err) {
    if (coupon.fresh && pricing.redemptionId) await releaseRedemption({ redemptionId: pricing.redemptionId, reason: "checkout_failed", actorId }).catch(() => {});
    return { ok: false, error: friendly(err, "We couldn't start the checkout. Please try again.") };
  }
}

/** Called with Razorpay Checkout's handler response. Activation only after the signature and Razorpay's own record agree. */
export async function confirmCheckout(companyId: string, response: CheckoutResponse, actorId = "system"): Promise<BillingActionResult> {
  const paymentId = String(response?.razorpay_payment_id ?? "");
  const subscriptionId = String(response?.razorpay_subscription_id ?? "");
  const signature = String(response?.razorpay_signature ?? "");
  if (!(await verifyCheckoutSignature(paymentId, subscriptionId, signature))) return { ok: false, error: "We couldn't verify this payment. If you were charged, it will be confirmed automatically within a few minutes." };
  const sub = await getCompanySubscription(companyId);
  const blocked = notBilled(sub);
  if (blocked) return { ok: false, error: blocked };

  let entity: RazorpaySubscription;
  try {
    entity = await fetchSubscription(subscriptionId);
  } catch (err) {
    return { ok: false, error: friendly(err, "Payment received, but we couldn't confirm it with Razorpay yet. It will update automatically.") };
  }
  if (noteOf(entity, "companyId") !== companyId) return { ok: false, error: "This payment belongs to a different workspace." };
  if (!["active", "authenticated"].includes(entity.status)) return { ok: false, error: "Razorpay hasn't confirmed the payment yet. This page will update automatically once it does." };

  // What this checkout was quoted at, read before adopting clears it: the amount when Razorpay can't be asked.
  const quotedTotal = sub?.checkout?.subscriptionId === entity.id ? sub.checkout.pricing.total : null;
  // The webhook does the same (whichever arrives first wins; the other is a no-op), and issues the invoice.
  const updated = await adoptSubscription(companyId, entity, { actorId, action: "subscription.checkout.confirm" });
  // A first charge that has happened is recorded NOW (ledger + tax invoice), not only when the webhook arrives: on a server Razorpay can't reach
  // (local development) or when the webhook is late, the history would otherwise stay empty. Both are idempotent on the payment id.
  if (entity.status === "active" && updated && paymentId) await settleConfirmedPayment(companyId, entity, paymentId, quotedTotal, updated);
  // Autopay approved, first charge later (a plan taken during the free trial): the history says so, so "I paid" never looks like "nothing happened".
  else if (entity.status === "authenticated" && updated) {
    const plan = await getPlan(updated.planId);
    const first = fromUnix(entity.start_at ?? entity.charge_at) ?? updated.trialEndsAt;
    await recordTransaction({
      companyId,
      type: "setup",
      amount: 0,
      currency: (updated.pricing?.currency ?? "INR").toUpperCase(),
      paymentId: entity.id,
      description: `${plan?.name ?? updated.planId} plan · autopay set up${first ? `, first charge ${fmtDate(first)}${updated.pricing ? ` of ${formatMoney(updated.pricing.total, updated.pricing.currency)}` : ""}` : ""}`,
      planId: updated.planId,
      planName: plan?.name ?? null,
      interval: updated.interval,
      subscriptionId: entity.id,
      payer: updated.billingDetails ? { name: updated.billingDetails.legalName, email: updated.billingDetails.email, gstin: updated.billingDetails.gstin } : null,
    });
  }
  if (entity.status === "active" && updated) return { ok: true, message: "Payment received — your subscription is active." };
  const startsAt = fromUnix(entity.start_at ?? entity.charge_at);
  return { ok: true, message: startsAt ? `You're all set. Your first charge is on ${fmtDate(startsAt)}.` : "You're all set." };
}

async function settleConfirmedPayment(companyId: string, entity: RazorpaySubscription, paymentId: string, quotedTotal: number | null, sub: CompanySubscription): Promise<void> {
  try {
    const paid = await fetchPayment(paymentId).catch(() => null);
    const amount = paid?.amount ?? quotedTotal;
    if (!amount) return;
    const currency = (paid?.currency ?? sub.pricing?.currency ?? "INR").toUpperCase();
    const payment = { id: paymentId, amount, currency, method: paid?.method ?? null };
    if (!sub.lastPayment || sub.lastPayment.id !== paymentId) {
      await updateCompanySubscription(companyId, { lastPayment: { id: paymentId, amount, currency, at: new Date(), periodStart: fromUnix(entity.current_start), periodEnd: fromUnix(entity.current_end) } });
    }
    const invoice = await issueInvoice(companyId, entity, payment, sub);
    await ledgerPayment(companyId, entity, payment, sub, invoice);
  } catch (err) {
    console.error(`[billing] recording confirmed payment ${paymentId} failed`, err);
  }
}

/**
 * "Missing a payment?": reads the subscription's paid charges from Razorpay and records any the ledger and the invoices don't have yet (a
 * checkout confirmed before the ledger existed, or a webhook that never arrived). Safe to run any number of times.
 */
export async function syncPaymentsFromRazorpay(companyId: string): Promise<{ ok: true; found: number } | { ok: false; error: string }> {
  const sub = await getCompanySubscription(companyId);
  const blocked = notBilled(sub);
  if (blocked || !sub) return { ok: false, error: blocked ?? "Unknown workspace." };
  const subscriptionId = sub.provider?.subscriptionId;
  if (!subscriptionId) return { ok: true, found: 0 };
  try {
    const [entity, invoices] = await Promise.all([fetchSubscription(subscriptionId), listSubscriptionInvoices(subscriptionId)]);
    const paid = invoices.filter((i) => i.status === "paid" && i.payment_id);
    for (const i of paid) await settleConfirmedPayment(companyId, entity, i.payment_id!, null, sub);
    return { ok: true, found: paid.length };
  } catch (err) {
    return { ok: false, error: friendly(err, "We couldn't reach Razorpay just now. Please try again in a moment.") };
  }
}

/** Re-subscribes after a scheduled cancellation: a new subscription whose first charge is when the current period (or trial) ends. */
export async function resumeSubscription(companyId: string, actorId = "system"): Promise<StartCheckoutResult> {
  const sub = await getCompanySubscription(companyId);
  const blocked = notBilled(sub);
  if (blocked || !sub) return { ok: false, error: blocked ?? "Unknown workspace." };
  if (!sub.cancelAtPeriodEnd) return { ok: false, error: "Your subscription isn't scheduled to end." };
  const live = await getRenewalRedemption(companyId);
  return startCheckout(companyId, { planId: sub.planId, interval: sub.interval, couponCode: live && live.couponId === currentPricing(sub)?.couponId ? live.code : null }, actorId);
}

// ── Plan changes & cancellation ──────────────────────────────────────────────

/**
 * Changes plan / interval. See the module comment for the upgrade (immediate,
 * pro-rata refund of the unused part of the last payment) and downgrade (at
 * cycle end) rules. `when` lets the Platform Console force either.
 */
export async function changePlan(
  companyId: string,
  input: { planId: string; interval: BillingInterval; couponCode?: string | null; when?: "auto" | "now" | "cycle_end"; startNow?: boolean },
  actorId = "system",
  action = "subscription.change_plan",
  /** The customer is at the screen and can authorise a payment (not the Platform Console). */
  customerPresent = false,
): Promise<BillingActionResult> {
  const sub = await getCompanySubscription(companyId);
  const blocked = notBilled(sub);
  if (blocked || !sub) return { ok: false, error: blocked ?? "Unknown workspace." };
  if (!hasLiveSubscription(sub)) return { ok: false, error: "You don't have an active subscription to change — choose a plan to subscribe." };
  if (customerPresent) {
    const lower = await downgradeBlock(sub, input.planId);
    if (lower) return { ok: false, error: lower };
  }
  if (!(await razorpayConfigured())) return { ok: false, error: "Online billing isn't configured yet." };
  // Unless a code is given, a discount that is still running carries over to the new plan.
  const running = await getRenewalRedemption(companyId);
  const couponCode = input.couponCode === undefined ? (running && running.couponId === currentPricing(sub)?.couponId ? running.code : null) : input.couponCode;
  // Staying on the same plan (interval switch): the plan line keeps the price version the company bought.
  const priced = await priceSubscription({ companyId, planId: input.planId, interval: input.interval, couponCode, priceVersion: input.planId === sub.planId ? sub.priceVersion : null });
  if (!priced.ok) return priced;
  if (input.couponCode?.trim() && priced.summary.couponError) return { ok: false, error: priced.summary.couponError };
  const { pricing } = priced;
  const plan = (await getPlan(pricing.planId))!;
  const subscriptionId = sub.provider!.subscriptionId!;
  const unchanged = plan._id === sub.planId && pricing.interval === sub.interval && currentPricing(sub)?.total === pricing.total;
  const coupon: { ok: true; fresh: boolean } | { ok: false; error: string } = unchanged ? { ok: true, fresh: false } : await attachCoupon(companyId, pricing, actorId);
  if (!coupon.ok) return coupon;
  const versionPatch = pricing.priceVersion ? { priceVersion: pricing.priceVersion } : {};

  try {
    if (unchanged) {
      if (!sub.pendingChange) return { ok: false, error: `You're already on ${plan.name} (${pricing.interval}).` };
      await cancelScheduledChanges(subscriptionId);
      await applyChange(companyId, sub, { pendingChange: null }, { actorId, action: `${action}.undo_scheduled` });
      return { ok: true, message: `Scheduled change canceled — you'll stay on ${plan.name}.` };
    }
    const razorpayPlanId = await ensureRazorpayPlan(plan, pricing.interval, pricing.total, pricing.currency);
    const remote = await fetchSubscription(subscriptionId);

    if (remote.status === "authenticated" || remote.status === "created") {
      // Nothing charged yet (still in the trial): switch outright.
      try {
        await updateSubscriptionPlan(subscriptionId, razorpayPlanId, "now", pricing.interval);
      } catch (err) {
        if (!isUpiNoEdit(err)) throw err;
        // A UPI mandate can't be edited either: nothing was charged, so the waiting subscription is dropped and the new plan is set up afresh
        // (starting when the trial ends, as before), with the customer approving the new mandate.
        if (!customerPresent) return { ok: false, error: "This company pays by UPI, which can't be changed from here. Ask them to change the plan in Settings → Billing, where they can approve the new payment." };
        await cancelRazorpaySubscription(subscriptionId, false);
        await applyChange(companyId, sub, { provider: { ...sub.provider!, subscriptionId: null }, pendingChange: null }, { actorId, action: `${action}.upi_replace`, details: { reason: "not charged yet" } });
        const started = await startCheckout(companyId, { planId: input.planId, interval: input.interval, couponCode, startNow: input.startNow }, actorId);
        if (!started.ok) return started;
        return { ok: true, checkout: started.checkout, message: "Approve the new plan's payment to finish." };
      }
      await applyChange(companyId, sub, { planId: plan._id, interval: pricing.interval, pricing, pendingChange: null, ...versionPatch }, { actorId, action, details: { when: "now", reason: "not charged yet" } });
      if (sub.pricing?.couponId !== pricing.couponId) await releaseUnused(companyId, sub.pricing?.redemptionId, "plan_changed_before_first_charge");
      return { ok: true, message: `You're now on ${plan.name}. Your first charge of ${formatMoney(pricing.total, pricing.currency)} is when your trial ends.` };
    }

    const currentMonthly = currentPricing(sub) ? monthlyOf(currentPricing(sub)!.net, sub.interval) : await subscriptionMrr({ ...sub, status: "active" });
    const isUpgrade = monthlyOf(pricing.net, pricing.interval) > currentMonthly;
    const when = input.when === "now" || input.when === "cycle_end" ? input.when : isUpgrade ? "now" : "cycle_end";

    if (when === "now") {
      try {
        await updateSubscriptionPlan(subscriptionId, razorpayPlanId, "now", pricing.interval);
      } catch (err) {
        if (!isUpiNoEdit(err)) throw err;
        return await switchViaNewSubscription(companyId, sub, { planId: input.planId, interval: input.interval, couponCode }, "now", actorId, customerPresent);
      }
      const refund = await refundUnused(companyId, sub, actorId);
      await applyChange(companyId, sub, { planId: plan._id, interval: pricing.interval, pricing, pendingChange: null, ...versionPatch }, { actorId, action, details: { when: "now", upgrade: isUpgrade, refund: refund ?? null } });
      return {
        ok: true,
        message: `You're now on ${plan.name} (${pricing.interval}). A new billing period starts today at ${formatMoney(pricing.total, pricing.currency)}${refund?.amount ? `; ${formatMoney(refund.amount, pricing.currency)} for the unused part of your last period is being refunded` : ""}.`,
      };
    }
    try {
      await updateSubscriptionPlan(subscriptionId, razorpayPlanId, "cycle_end", pricing.interval);
    } catch (err) {
      if (!isUpiNoEdit(err)) throw err;
      return await switchViaNewSubscription(companyId, sub, { planId: input.planId, interval: input.interval, couponCode }, "cycle_end", actorId, customerPresent);
    }
    const effectiveAt = fromUnix(remote.current_end) ?? sub.currentPeriodEnd;
    await applyChange(companyId, sub, { pendingChange: { planId: plan._id, interval: pricing.interval, effectiveAt, pricing } }, { actorId, action: `${action}.scheduled`, details: { to: `${plan._id}/${pricing.interval}`, effectiveAt } });
    return { ok: true, message: `You'll move to ${plan.name} (${pricing.interval}) on ${fmtDate(effectiveAt)}, when your current period ends.` };
  } catch (err) {
    if (coupon.fresh && pricing.redemptionId) await releaseRedemption({ redemptionId: pricing.redemptionId, reason: "plan_change_failed", actorId }).catch(() => {});
    return { ok: false, error: friendly(err, "We couldn't change your plan. Please try again.") };
  }
}

/** Razorpay can't edit a subscription whose payment mode is UPI (an autopay mandate is fixed to one amount). */
function isUpiNoEdit(err: unknown): boolean {
  return /cannot be updated|payment mode is upi/i.test(err instanceof Error ? err.message : String(err ?? ""));
}

/**
 * The plan change for a UPI subscription: the new plan is a NEW subscription the customer authorises again.
 *  - upgrade ("now"): starts at once; when it is confirmed the old one is canceled and its unused part refunded (see `adoptSubscription`).
 *  - downgrade ("cycle_end"): the old one is set to end with the period they paid for, and the new one starts when it ends.
 * Needs the customer at the screen (a Platform Console change can't authorise a payment for them).
 */
async function switchViaNewSubscription(
  companyId: string,
  sub: CompanySubscription,
  input: { planId: string; interval: BillingInterval; couponCode: string | null },
  when: "now" | "cycle_end",
  actorId: string,
  customerPresent: boolean,
): Promise<BillingActionResult> {
  if (!customerPresent) return { ok: false, error: "This company pays by UPI, which can't be changed from here. Ask them to change the plan in Settings → Billing, where they can approve the new payment." };
  if (when === "cycle_end") {
    const ended = await cancelSubscription(companyId, { when: "period_end" }, actorId, "subscription.change_plan.upi_switch");
    if (!ended.ok) return ended;
  }
  const started = await startCheckout(companyId, { ...input, replaceLive: when === "now" }, actorId);
  if (!started.ok) return started;
  await recordPlatformAudit({ actorId, action: "subscription.change_plan.upi_switch", target: { type: "subscription", id: companyId }, companyId, details: { from: `${sub.planId}/${sub.interval}`, to: `${input.planId}/${input.interval}`, when } });
  return {
    ok: true,
    checkout: started.checkout,
    message: when === "now" ? "Approve the new plan's payment to finish the upgrade." : "Approve the new plan's payment: it starts when your current period ends.",
  };
}

/** Pro-rata refund of the unused part of the last payment (immediate upgrade). Best effort; audited either way. */
async function refundUnused(companyId: string, sub: CompanySubscription, actorId: string): Promise<{ amount: number; refundId: string | null; error?: string } | null> {
  const last = sub.lastPayment;
  const start = last?.periodStart ?? sub.currentPeriodStart;
  const end = last?.periodEnd ?? sub.currentPeriodEnd;
  if (!last || !start || !end) return null;
  const now = Date.now();
  const span = end.getTime() - start.getTime();
  if (span <= 0 || now >= end.getTime()) return null;
  const amount = Math.floor((last.amount * (end.getTime() - Math.max(now, start.getTime()))) / span);
  if (amount < MIN_REFUND) return null;
  try {
    const refund = await refundPayment(last.id, amount, { companyId, reason: "prorated_upgrade" });
    await recordPlatformAudit({ actorId, action: "subscription.refund.prorated", target: { type: "subscription", id: companyId }, companyId, details: { paymentId: last.id, amount, refundId: refund.id } });
    await recordTransaction({ companyId, type: "refund", amount, currency: last.currency, paymentId: last.id, refundId: refund.id, description: "Refund for the unused part of your previous plan", subscriptionId: sub.provider?.subscriptionId ?? null, planId: sub.planId, interval: sub.interval });
    return { amount, refundId: refund.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordPlatformAudit({ actorId, action: "subscription.refund.failed", target: { type: "subscription", id: companyId }, companyId, details: { paymentId: last.id, amount, error, needsManualRefund: true } });
    return { amount: 0, refundId: null, error };
  }
}

export async function cancelSubscription(companyId: string, input: { when: "period_end" | "now" }, actorId = "system", action = "subscription.cancel"): Promise<BillingActionResult> {
  const sub = await getCompanySubscription(companyId);
  const blocked = notBilled(sub);
  if (blocked || !sub) return { ok: false, error: blocked ?? "Unknown workspace." };
  const subscriptionId = sub.provider?.subscriptionId;
  const now = input?.when === "now";

  try {
    if (!subscriptionId || !["trialing", "active", "past_due", "grace"].includes(sub.status)) {
      if (!now || sub.status === "canceled") return { ok: false, error: "There's no active subscription to cancel." };
      // No Razorpay subscription (trial without checkout, or a manually managed one): cancel locally.
      await applyChange(companyId, sub, { status: "canceled", cancelAtPeriodEnd: false, pendingChange: null, graceEndsAt: null }, { actorId, action, details: { when: "now" } });
      return { ok: true, message: "The subscription has been canceled. The workspace is now read-only." };
    }
    if (sub.status === "trialing" && !now) {
      // Nothing has been charged yet: drop the scheduled subscription; the trial runs out on its own.
      await cancelRazorpaySubscription(subscriptionId, false);
      await applyChange(companyId, sub, { provider: { ...sub.provider!, subscriptionId: null }, cancelAtPeriodEnd: true, pendingChange: null }, { actorId, action, details: { when: "trial_end" } });
      await releaseUnused(companyId, sub.pricing?.redemptionId, "canceled_before_first_charge");
      return { ok: true, message: `Canceled. You won't be charged; your trial ends on ${fmtDate(sub.trialEndsAt)}.` };
    }
    if (sub.cancelAtPeriodEnd && !now) return { ok: false, error: "Your subscription is already set to end with this period." };
    if (!now && sub.status === "active") {
      await cancelRazorpaySubscription(subscriptionId, true);
      await applyChange(companyId, sub, { cancelAtPeriodEnd: true, pendingChange: null }, { actorId, action, details: { when: "period_end" } });
      return { ok: true, message: `Your subscription will end on ${fmtDate(sub.currentPeriodEnd)}. You keep full access until then.` };
    }
    await cancelRazorpaySubscription(subscriptionId, false);
    await applyChange(companyId, sub, { status: "canceled", cancelAtPeriodEnd: false, pendingChange: null, graceEndsAt: null }, { actorId, action, details: { when: "now" } });
    await releaseUnused(companyId, sub.pricing?.redemptionId, "canceled_before_first_charge");
    return { ok: true, message: "The subscription has been canceled. The workspace is now read-only." };
  } catch (err) {
    return { ok: false, error: friendly(err, "We couldn't cancel the subscription. Please try again.") };
  }
}

// ── Re-pricing (coupon ended, add-ons changed) ───────────────────────────────

/**
 * Re-quotes a live subscription and, when the per-cycle total has changed,
 * moves it onto the Razorpay plan for the new amount at the END of the
 * current cycle (immediately if nothing has been charged yet). Called
 *  - after every successful charge: a "once" / N-cycle coupon whose discounted
 *    cycles are all billed (`getRenewalRedemption` no longer returns it) is
 *    dropped, so the next cycle is charged at full price; a "forever" coupon
 *    keeps re-quoting to the same total and is left alone;
 *  - by the Platform Console after a company's add-ons change;
 *  - by the daily cron, as a retry.
 * The plan line stays at the price version the company bought. No-op when the
 * total is unchanged or there is no live Razorpay subscription (the next
 * checkout is quoted fresh anyway).
 */
export async function repriceSubscription(companyId: string, actorId = "system"): Promise<BillingActionResult> {
  const sub = await getCompanySubscription(companyId);
  const blocked = notBilled(sub);
  if (blocked || !sub) return { ok: false, error: blocked ?? "Unknown workspace." };
  if (!hasLiveSubscription(sub)) return { ok: true, message: "No live Razorpay subscription — the next checkout is priced fresh." };
  if (!(await razorpayConfigured())) return { ok: false, error: "Online billing isn't configured yet." };

  const target = sub.pendingChange ?? { planId: sub.planId, interval: sub.interval };
  const base = sub.pendingChange ? (sub.pendingChange.pricing ?? null) : currentPricing(sub);
  const running = await getRenewalRedemption(companyId);
  const keepCoupon = Boolean(base?.couponId && running && running.couponId === base.couponId);
  const priced = await priceSubscription({
    companyId,
    planId: target.planId,
    interval: target.interval,
    couponCode: keepCoupon ? running!.code : null,
    priceVersion: target.planId === sub.planId ? sub.priceVersion : (base?.priceVersion ?? null),
  });
  if (!priced.ok) return priced;
  const { pricing } = priced;
  pricing.redemptionId = keepCoupon && pricing.couponId ? running!._id : null;
  if (base && base.total === pricing.total) return { ok: true, message: "Price unchanged." };

  const couponEnded = Boolean(base?.couponId && !pricing.couponId);
  const action = couponEnded ? "subscription.coupon_ended" : "subscription.reprice";
  const details = { from: base?.total ?? null, to: pricing.total, ...(couponEnded ? { couponId: base!.couponId, couponCode: base!.couponCode } : {}) };
  const subscriptionId = sub.provider!.subscriptionId!;
  try {
    const plan = (await getPlan(pricing.planId))!;
    const razorpayPlanId = await ensureRazorpayPlan(plan, pricing.interval, pricing.total, pricing.currency);
    const remote = await fetchSubscription(subscriptionId);
    if (remote.status === "authenticated" || remote.status === "created") {
      await updateSubscriptionPlan(subscriptionId, razorpayPlanId, "now", pricing.interval);
      await applyChange(companyId, sub, { pricing, pendingChange: null }, { actorId, action, details: { ...details, when: "now" } });
      return { ok: true, message: `Re-priced to ${formatMoney(pricing.total, pricing.currency)} per cycle from the first charge.` };
    }
    await updateSubscriptionPlan(subscriptionId, razorpayPlanId, "cycle_end", pricing.interval);
    const effectiveAt = fromUnix(remote.current_end) ?? sub.currentPeriodEnd;
    await applyChange(companyId, sub, { pendingChange: { planId: pricing.planId, interval: pricing.interval, effectiveAt, pricing } }, { actorId, action, details: { ...details, when: "cycle_end", effectiveAt } });
    return { ok: true, message: `Re-priced to ${formatMoney(pricing.total, pricing.currency)} per cycle from ${fmtDate(effectiveAt)}.` };
  } catch (err) {
    await recordPlatformAudit({ actorId, action: `${action}.failed`, target: { type: "subscription", id: companyId }, companyId, details: { ...details, error: err instanceof Error ? err.message.slice(0, 300) : String(err) } });
    return { ok: false, error: friendly(err, "We couldn't re-price the subscription.") };
  }
}

// ── Webhook ──────────────────────────────────────────────────────────────────

export interface RazorpayWebhookPayload {
  event: string;
  created_at?: number;
  payload?: {
    subscription?: { entity: RazorpaySubscription };
    payment?: { entity: RazorpayPayment };
  };
}

export type WebhookOutcome = { status: "processed" | "duplicate" | "ignored"; detail?: string };

export const WEBHOOK_EVENTS_COLLECTION = "billing_webhook_events";

export interface WebhookEventDoc {
  _id: string;
  event: string;
  subscriptionId: string | null;
  companyId: string | null;
  paymentId: string | null;
  amount: number | null;
  currency: string | null;
  status: "processing" | "processed" | "ignored" | "failed";
  detail: string | null;
  attempts: number;
  payload: RazorpayWebhookPayload;
  receivedAt: Date;
  claimedAt: Date;
  processedAt: Date | null;
}

/** A crashed attempt is retried once it's been "processing" this long. */
const STALE_CLAIM_MS = 5 * 60_000;

/**
 * Handles one signature-verified Razorpay webhook event. Idempotent on the
 * event id: every event is stored in `billing_webhook_events`, and an event
 * already processed (or being processed) is acknowledged without effect. A
 * failure is recorded and rethrown so Razorpay retries it.
 */
export async function handleWebhook(eventId: string, payload: RazorpayWebhookPayload): Promise<WebhookOutcome> {
  const events = (await getPlatformDb()).collection<WebhookEventDoc>(WEBHOOK_EVENTS_COLLECTION);
  const now = new Date();
  const payment = payload.payload?.payment?.entity ?? null;
  const subscriptionIdHint = payload.payload?.subscription?.entity?.id ?? payment?.subscription_id ?? null;
  try {
    await events.insertOne({
      _id: eventId,
      event: String(payload.event ?? ""),
      subscriptionId: subscriptionIdHint,
      companyId: null,
      paymentId: payment?.id ?? null,
      amount: typeof payment?.amount === "number" ? payment.amount : null,
      currency: payment?.currency ?? null,
      status: "processing",
      detail: null,
      attempts: 1,
      payload,
      receivedAt: now,
      claimedAt: now,
      processedAt: null,
    });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    const reclaimed = await events.findOneAndUpdate(
      { _id: eventId, $or: [{ status: "failed" }, { status: "processing", claimedAt: { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } }] },
      { $set: { status: "processing", claimedAt: now }, $inc: { attempts: 1 } },
    );
    if (!reclaimed) return { status: "duplicate" };
  }

  try {
    const { outcome, companyId, subscriptionId } = await processEvent(eventId, payload);
    await events.updateOne({ _id: eventId }, { $set: { status: outcome.status === "ignored" ? "ignored" : "processed", detail: outcome.detail ?? null, companyId, subscriptionId, processedAt: new Date() } });
    return outcome;
  } catch (err) {
    await events.updateOne({ _id: eventId }, { $set: { status: "failed", detail: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500) } });
    throw err;
  }
}

/** Recent webhook deliveries for the Platform Console (payload omitted). */
export async function listWebhookEvents(limit = 25): Promise<Omit<WebhookEventDoc, "payload">[]> {
  return (await getPlatformDb())
    .collection<WebhookEventDoc>(WEBHOOK_EVENTS_COLLECTION)
    .find({}, { projection: { payload: 0 } })
    .sort({ receivedAt: -1 })
    .limit(Math.min(Math.max(1, limit), 100))
    .toArray();
}

const ADOPTING_EVENTS = new Set(["subscription.authenticated", "subscription.activated", "subscription.charged"]);

async function processEvent(eventId: string, payload: RazorpayWebhookPayload): Promise<{ outcome: WebhookOutcome; companyId: string | null; subscriptionId: string | null }> {
  const event = String(payload.event ?? "");
  const entity = payload.payload?.subscription?.entity ?? null;
  const payment = payload.payload?.payment?.entity ?? null;

  // A one-time top-up bought through an order: handled apart from the subscription (it has no subscription id).
  if ((event === "payment.captured" || event === "order.paid") && payment?.order_id) {
    const { topupFromWebhook } = await import("@/lib/platform/billing/credits");
    const top = await topupFromWebhook(payment);
    if (top.handled) return { outcome: { status: "processed" as const, detail: `top-up: ${top.detail ?? "ok"}` }, companyId: null, subscriptionId: null };
  }

  let subscriptionId = entity?.id ?? payment?.subscription_id ?? null;
  if (!subscriptionId && event === "payment.failed" && payment?.invoice_id) {
    subscriptionId = await fetchInvoiceSubscriptionId(payment.invoice_id).catch(() => null);
  }
  const ignored = (detail: string, companyId: string | null = null) => ({ outcome: { status: "ignored" as const, detail }, companyId, subscriptionId });
  if (!subscriptionId) return ignored("not a subscription event");

  const col = await companies();
  let company = await col.findOne({ "subscription.provider.subscriptionId": subscriptionId }, { projection: { isPlatformOwner: 1, subscription: 1 } });
  let adopt = false;
  if (!company && entity && ADOPTING_EVENTS.has(event)) {
    // A checkout the browser never confirmed (tab closed after paying): our own notes, set server-side
    // at checkout and delivered in a signature-verified webhook, name the company.
    const companyId = noteOf(entity, "companyId");
    const candidate = companyId ? await col.findOne({ _id: companyId }, { projection: { isPlatformOwner: 1, subscription: 1 } }) : null;
    if (candidate && !candidate.isPlatformOwner && noteOf(entity, "purpose") === "platform_subscription" && !hasLiveSubscription(await getCompanySubscription(candidate._id))) {
      company = candidate;
      adopt = true;
    }
  }
  if (!company) return ignored("unknown subscription");
  if (company.isPlatformOwner) return ignored("platform owner is never billed", company._id);
  const companyId = company._id;
  const done = (detail: string) => ({ outcome: { status: "processed" as const, detail }, companyId, subscriptionId });
  const opts = (verb: string): ChangeOptions => ({ actorId: "system", action: `subscription.webhook.${verb}`, key: eventId, details: { razorpayEvent: event, eventId } });

  if (adopt && entity) await adoptSubscription(companyId, entity, opts("adopt"));
  const current = await getCompanySubscription(companyId);
  if (!current || current.status === "internal") return ignored("not billed", companyId);

  switch (event) {
    case "subscription.authenticated":
      return done(adopt ? "adopted" : "no change");

    case "subscription.activated":
    case "subscription.charged":
    case "subscription.updated":
    case "subscription.resumed": {
      if (!entity) return ignored("missing subscription entity", companyId);
      const resolved = await resolvePlan(entity);
      const planPatch: Partial<CompanySubscription> = {};
      if (resolved && (resolved.planId !== current.planId || resolved.interval !== current.interval)) {
        planPatch.planId = resolved.planId;
        planPatch.interval = resolved.interval;
      }
      const pending = current.pendingChange;
      // A scheduled change has taken effect once Razorpay reports the plan it was scheduled onto (matched by amount:
      // a coupon ending or an add-on change keeps the same plan + interval).
      const rzpAmount = pending?.pricing ? await razorpayPlanAmount(entity.plan_id) : null;
      if (resolved && pending && pending.planId === resolved.planId && pending.interval === resolved.interval && (!pending.pricing || rzpAmount === null || rzpAmount === pending.pricing.total)) {
        planPatch.pendingChange = null;
        if (pending.pricing) {
          planPatch.pricing = pending.pricing;
          if (pending.pricing.priceVersion) planPatch.priceVersion = pending.pricing.priceVersion;
        }
      }
      // A charge proves the subscription is active even if its entity snapshot lags.
      const statusPatch = await patchFromEntity(current, event === "subscription.charged" ? { ...entity, status: "active" } : entity);
      const charged = event === "subscription.charged" && payment?.id;
      const paymentPatch: Partial<CompanySubscription> = charged
        ? { lastPayment: { id: payment.id, amount: payment.amount, currency: payment.currency.toUpperCase(), at: new Date(), periodStart: fromUnix(entity.current_start), periodEnd: fromUnix(entity.current_end) } }
        : {};
      const after = await applyChange(companyId, current, { ...planPatch, ...statusPatch, ...paymentPatch }, { ...opts(charged ? "charged" : event.split(".")[1]), details: { razorpayEvent: event, eventId, ...(charged ? { paymentId: payment.id, amount: payment.amount } : {}) } });
      if (charged) {
        // This charge carried the coupon discount → one more discounted cycle billed.
        if (after.pricing?.redemptionId && after.pricing.discount > 0) await markRedemptionCycleBilled(after.pricing.redemptionId);
        const invoice = await issueInvoice(companyId, entity, { id: payment.id, amount: payment.amount, currency: payment.currency }, after);
        await ledgerPayment(companyId, entity, { id: payment.id, amount: payment.amount, currency: payment.currency.toUpperCase(), method: payment.method ?? null }, after, invoice);
        // A limited coupon that has now run out (or an add-on change) → next cycle at the new price. The daily cron retries a failure.
        await repriceSubscription(companyId, "system").catch((err) => console.error(`[billing] reprice after charge failed for ${companyId}`, err));
      }
      return done(charged ? "charged" : "synced");
    }

    case "subscription.pending":
    case "payment.failed": {
      if (event === "payment.failed" && payment?.id) {
        await recordTransaction({ companyId, type: "failed", amount: payment.amount, currency: payment.currency, paymentId: payment.id, description: "Subscription payment failed", method: payment.method ?? null, subscriptionId, reason: payment.error_description ?? null });
      }
      if (!["active", "trialing", "past_due"].includes(current.status)) return done(`no change from ${current.status}`);
      const failedPayments = (current.dunning?.failedPayments ?? 0) + (event === "payment.failed" ? 1 : 0);
      const wasPastDue = current.status === "past_due";
      await applyChange(companyId, current, { status: "past_due", dunning: { failedPayments, pastDueSince: current.dunning?.pastDueSince ?? new Date() } }, { ...opts(event === "payment.failed" ? "payment_failed" : "pending"), details: { razorpayEvent: event, eventId, failedPayments, reason: payment?.error_description ?? null } });
      if (!wasPastDue) await notify(companyId, "payment_failed");
      return done("past_due");
    }

    case "subscription.halted": {
      if (current.status === "grace" || current.status === "suspended" || current.status === "canceled") return done(`no change from ${current.status}`);
      await applyChange(companyId, current, { status: "grace", graceEndsAt: new Date(Date.now() + (await graceDays()) * DAY_MS) }, opts("halted"));
      await releaseUnused(companyId, current.pricing?.redemptionId, "payment_halted");
      await notify(companyId, "grace");
      return done("grace");
    }

    case "subscription.cancelled":
    case "subscription.completed": {
      if (current.status === "canceled") return done("already canceled");
      await applyChange(companyId, current, { status: "canceled", cancelAtPeriodEnd: false, pendingChange: null, graceEndsAt: null }, opts(event.split(".")[1]));
      await releaseUnused(companyId, current.pricing?.redemptionId, "subscription_cancelled");
      await notify(companyId, "canceled");
      return done("canceled");
    }

    default:
      return ignored(`unhandled event ${event}`, companyId);
  }
}

// ── Dunning (daily cron) ─────────────────────────────────────────────────────

export interface DunningSummary {
  checked: number;
  toPastDue: number;
  toGrace: number;
  suspended: number;
  canceled: number;
  reconciled: number;
  errors: number;
}

/**
 * Daily: moves overdue subscriptions along the lifecycle and emails the
 * company at each step. Safe to run repeatedly — each transition is keyed on
 * the stored state.
 */
export async function runDunningSweep(now: Date = new Date()): Promise<DunningSummary> {
  const summary: DunningSummary = { checked: 0, toPastDue: 0, toGrace: 0, suspended: 0, canceled: 0, reconciled: 0, errors: 0 };
  const rows = await (await companies())
    .find({ isPlatformOwner: { $ne: true }, $or: [{ subscription: { $exists: false } }, { "subscription.status": { $in: ["trialing", "active", "past_due", "grace"] } }, { "subscription.checkout.subscriptionId": { $exists: true } }] }, { projection: { _id: 1 } })
    .toArray();
  const t = now.getTime();
  const grace = await graceDays();
  const cron = (verb: string): ChangeOptions => ({ actorId: "system", action: `subscription.cron.${verb}` });

  for (const { _id: companyId } of rows) {
    summary.checked++;
    try {
      const sub = await getCompanySubscription(companyId);
      if (!sub || sub.status === "internal") continue;

      // A checkout nobody paid within a day is abandoned: free its coupon (unless the live subscription uses it).
      if (sub.checkout && t - new Date(sub.checkout.pricing.quotedAt).getTime() > DAY_MS) {
        await releaseUnused(companyId, sub.checkout.pricing.redemptionId, "checkout_abandoned", sub.provider?.subscriptionId ? (sub.pricing?.redemptionId ?? null) : null);
        await updateCompanySubscription(companyId, { checkout: null });
      }
      // Retry of the after-charge re-price (coupon ran out / add-ons changed) if it failed then.
      if (sub.status === "active" && hasLiveSubscription(sub) && sub.pricing?.couponId && !sub.pendingChange) {
        await repriceSubscription(companyId, "system");
      }

      if (sub.status === "past_due") {
        const since = sub.dunning?.pastDueSince ?? sub.updatedAt;
        if (t - since.getTime() >= PAST_DUE_BACKSTOP_DAYS * DAY_MS) {
          await applyChange(companyId, sub, { status: "grace", graceEndsAt: new Date(t + grace * DAY_MS) }, cron("past_due_backstop"));
          await notify(companyId, "grace");
          summary.toGrace++;
        }
      } else if (sub.status === "grace") {
        if (!sub.graceEndsAt || sub.graceEndsAt.getTime() <= t) {
          await applyChange(companyId, sub, { status: "suspended" }, cron("grace_expired"));
          await notify(companyId, "suspended");
          summary.suspended++;
        }
      } else if (sub.status === "trialing" && sub.trialEndsAt) {
        const end = sub.trialEndsAt.getTime();
        if (end <= t) {
          if (sub.provider?.subscriptionId && t - end < TRIAL_CHARGE_WAIT_MS) {
            // First charge scheduled for trial end — ask Razorpay rather than wait for a possibly missed webhook.
            if (await reconcile(companyId, sub)) summary.reconciled++;
          } else {
            await applyChange(companyId, sub, { status: "suspended" }, cron("trial_expired"));
            await notify(companyId, "trial_ended");
            summary.suspended++;
          }
        }
      } else if (sub.status === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() <= t) {
        if (sub.cancelAtPeriodEnd) {
          await applyChange(companyId, sub, { status: "canceled", cancelAtPeriodEnd: false, pendingChange: null }, cron("period_ended_canceled"));
          await notify(companyId, "canceled");
          summary.canceled++;
        } else if (t - sub.currentPeriodEnd.getTime() > DAY_MS) {
          if (sub.provider?.subscriptionId) {
            // The renewal webhook never arrived: take Razorpay's word for it.
            if (await reconcile(companyId, sub)) summary.reconciled++;
          } else {
            // Manually managed (Platform Console) period ran out without a renewal.
            await applyChange(companyId, sub, { status: "past_due", dunning: { failedPayments: 0, pastDueSince: now } }, cron("period_ended_unpaid"));
            await notify(companyId, "payment_failed");
            summary.toPastDue++;
          }
        }
      }
    } catch (err) {
      summary.errors++;
      console.error(`[billing] dunning failed for ${companyId}`, err);
    }
  }
  return summary;
}

/** Applies Razorpay's current state of the company's subscription. True if anything changed. */
async function reconcile(companyId: string, sub: CompanySubscription): Promise<boolean> {
  if (!(await razorpayConfigured()) || !sub.provider?.subscriptionId) return false;
  const entity = await fetchSubscription(sub.provider.subscriptionId);
  const patch = await patchFromEntity(sub, entity);
  if (Object.keys(patch).length === 0 || (patch.status === sub.status && !patch.currentPeriodEnd)) return false;
  await applyChange(companyId, sub, patch, { actorId: "system", action: "subscription.cron.reconcile", details: { razorpayStatus: entity.status } });
  if (patch.status === "past_due" && sub.status !== "past_due") await notify(companyId, "payment_failed");
  if (patch.status === "grace") await notify(companyId, "grace");
  if (patch.status === "canceled") await notify(companyId, "canceled");
  return true;
}
