import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { PLANS_COLLECTION } from "@/lib/platform/billing/plans";
import { getRazorpayCredentials, type RazorpayCredentials } from "@/lib/platform/billing/razorpay-config";
import type { BillingInterval, Plan } from "@/lib/platform/billing/types";

/**
 * Razorpay REST client for PLATFORM subscription billing — the platform
 * owner's own Razorpay account collecting from customer companies. The
 * credentials come from the Platform Console (`razorpay-config.ts`; env only as
 * a fallback while nothing is saved). Plain `fetch`, no SDK, so tests can mock
 * the network. Every call throws `RazorpayError` on a non-2xx answer.
 *
 * Separate from the FMS/HRMS Razorpay code, which acts for a company's own
 * customers and payees.
 */

const API = "https://api.razorpay.com/v1";

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "RazorpayError";
  }
}

export async function razorpayConfigured(): Promise<boolean> {
  return (await getRazorpayCredentials()) !== null;
}

/** Public key id for Razorpay Checkout in the browser (safe to expose). */
export async function razorpayKeyId(): Promise<string> {
  return (await getRazorpayCredentials())?.keyId ?? "";
}

async function credentials(): Promise<RazorpayCredentials> {
  const creds = await getRazorpayCredentials();
  if (!creds) throw new RazorpayError("Razorpay is not configured.", 0, "NOT_CONFIGURED");
  return creds;
}

async function call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown, creds?: RazorpayCredentials): Promise<T> {
  const { keyId, keySecret } = creds ?? (await credentials());
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { description?: string; code?: string } };
  if (!res.ok) throw new RazorpayError(data.error?.description || `Razorpay request failed (${res.status})`, res.status, data.error?.code ?? null);
  return data as T;
}

/**
 * Checks the saved keys against Razorpay with a harmless read (one plan).
 * Never returns or logs the secret.
 */
export async function testRazorpayConnection(): Promise<{ ok: boolean; message: string }> {
  const creds = await getRazorpayCredentials();
  if (!creds) return { ok: false, message: "No keys saved yet (or the saved secret can't be decrypted — check PLATFORM_ENCRYPTION_KEY)." };
  try {
    await call<{ count?: number }>("GET", "/plans?count=1", undefined, creds);
    return { ok: true, message: `Connected to Razorpay in ${creds.mode} mode with ${creds.keyId}.` };
  } catch (err) {
    if (err instanceof RazorpayError) return { ok: false, message: err.status === 401 ? "Razorpay rejected these keys (401). Check the key id and secret." : `Razorpay answered: ${err.message}` };
    return { ok: false, message: "Couldn't reach Razorpay. Check the server's network access and try again." };
  }
}

// ── Entities (only the fields we use) ────────────────────────────────────────

export type RazorpaySubscriptionStatus = "created" | "authenticated" | "active" | "pending" | "halted" | "cancelled" | "completed" | "expired" | "paused";

export interface RazorpaySubscription {
  id: string;
  plan_id: string;
  customer_id?: string | null;
  status: RazorpaySubscriptionStatus;
  /** Unix seconds. */
  current_start: number | null;
  current_end: number | null;
  charge_at?: number | null;
  start_at?: number | null;
  paid_count?: number;
  short_url?: string;
  notes?: Record<string, string> | [];
}

export interface RazorpayPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  invoice_id?: string | null;
  subscription_id?: string | null;
  error_description?: string | null;
  /** upi | card | netbanking | wallet | emandate … */
  method?: string;
  /** Set when the payment was made against an order (a one-time purchase, not a subscription charge). */
  order_id?: string | null;
}

// ── Signatures ───────────────────────────────────────────────────────────────

function safeEqualHex(expected: string, given: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout handler signature: HMAC-SHA256(`payment_id|subscription_id`, key secret). */
export async function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string): Promise<boolean> {
  const secret = (await getRazorpayCredentials())?.keySecret;
  if (!secret || !paymentId || !subscriptionId || !signature) return false;
  return safeEqualHex(createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`).digest("hex"), signature);
}

/** Checkout handler signature for an ORDER payment: HMAC-SHA256(`order_id|payment_id`, key secret). */
export async function verifyOrderSignature(orderId: string, paymentId: string, signature: string): Promise<boolean> {
  const secret = (await getRazorpayCredentials())?.keySecret;
  if (!secret || !orderId || !paymentId || !signature) return false;
  return safeEqualHex(createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex"), signature);
}

/** Webhook signature: HMAC-SHA256(raw body, webhook secret) in `x-razorpay-signature`. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature) return false;
  return safeEqualHex(createHmac("sha256", secret).update(rawBody).digest("hex"), signature);
}

// ── Customers ────────────────────────────────────────────────────────────────

export async function createCustomer(input: { name: string; email: string; gstin?: string | null; notes?: Record<string, string> }): Promise<{ id: string }> {
  return call<{ id: string }>("POST", "/customers", {
    name: input.name.slice(0, 50),
    email: input.email,
    ...(input.gstin ? { gstin: input.gstin } : {}),
    // Returns the existing customer for this email instead of failing.
    fail_existing: "0",
    notes: input.notes ?? {},
  });
}

// ── Plans ────────────────────────────────────────────────────────────────────

/** A Razorpay plan we created for one exact charge amount (stored on the catalogue plan). */
export interface RazorpayPlanRef {
  id: string;
  interval: BillingInterval;
  /** Tax-inclusive amount per cycle, smallest currency unit. */
  amount: number;
  currency: string;
  /** The Razorpay key the plan lives under (test and live accounts don't share plans). */
  keyId: string;
  createdAt: Date;
}

type PlanWithRazorpayPlans = Plan & { razorpayPlans?: RazorpayPlanRef[] };

/**
 * The Razorpay plan that charges exactly `amount` (tax-inclusive, from the
 * checkout quote) every `interval` for our plan — created lazily and
 * remembered in `billing_plans.razorpayPlans`. Razorpay plans are immutable,
 * so a new price, coupon discount or add-on mix gets its own Razorpay plan;
 * existing subscribers keep theirs until they change plan.
 */
export async function ensureRazorpayPlan(plan: Plan, interval: BillingInterval, amount: number, currency: string): Promise<string> {
  if (!Number.isInteger(amount) || amount <= 0) throw new RazorpayError("Invalid plan amount.", 0, "BAD_AMOUNT");
  const creds = await credentials();
  const col = (await getPlatformDb()).collection<PlanWithRazorpayPlans>(PLANS_COLLECTION);
  const fresh = await col.findOne({ _id: plan._id }, { projection: { razorpayPlans: 1 } });
  const hit = fresh?.razorpayPlans?.find((r) => r.keyId === creds.keyId && r.interval === interval && r.amount === amount && r.currency === currency);
  if (hit) return hit.id;
  const created = await call<{ id: string }>(
    "POST",
    "/plans",
    {
      period: interval === "yearly" ? "yearly" : "monthly",
      interval: 1,
      item: { name: `${plan.name} (${interval})`.slice(0, 100), amount, currency, description: (plan.description || plan.name).slice(0, 250) },
      notes: { planId: plan._id, interval, purpose: "platform_subscription" },
    },
    creds,
  );
  const ref: RazorpayPlanRef = { id: created.id, interval, amount, currency, keyId: creds.keyId, createdAt: new Date() };
  await col.updateOne({ _id: plan._id }, { $push: { razorpayPlans: ref } });
  return created.id;
}

/** Our plan + interval for a Razorpay plan id (from the ids stored on the catalogue). */
export async function findPlanByRazorpayId(razorpayPlanId: string): Promise<{ plan: Plan; interval: BillingInterval } | null> {
  if (!razorpayPlanId) return null;
  const plan = await (await getPlatformDb())
    .collection<PlanWithRazorpayPlans>(PLANS_COLLECTION)
    .findOne({ $or: [{ "razorpayPlans.id": razorpayPlanId }, { "provider.razorpay.monthly": razorpayPlanId }, { "provider.razorpay.yearly": razorpayPlanId }] });
  if (!plan) return null;
  const ref = plan.razorpayPlans?.find((r) => r.id === razorpayPlanId);
  return { plan, interval: ref?.interval ?? (plan.provider?.razorpay?.yearly === razorpayPlanId ? "yearly" : "monthly") };
}

/** The amount (tax-inclusive, per cycle) a Razorpay plan we created charges, when we know it. */
export async function razorpayPlanAmount(razorpayPlanId: string): Promise<number | null> {
  if (!razorpayPlanId) return null;
  const plan = await (await getPlatformDb()).collection<PlanWithRazorpayPlans>(PLANS_COLLECTION).findOne({ "razorpayPlans.id": razorpayPlanId }, { projection: { razorpayPlans: 1 } });
  return plan?.razorpayPlans?.find((r) => r.id === razorpayPlanId)?.amount ?? null;
}

// ── Subscriptions ────────────────────────────────────────────────────────────

/** Billing cycles Razorpay should run before the subscription completes (~10 years). */
export function totalCountFor(interval: BillingInterval): number {
  return interval === "yearly" ? 10 : 120;
}

export async function createSubscription(input: {
  planId: string;
  customerId: string | null;
  interval: BillingInterval;
  /** Unix seconds; omitted = first charge at checkout. */
  startAt?: number | null;
  notes: Record<string, string>;
}): Promise<RazorpaySubscription> {
  return call<RazorpaySubscription>("POST", "/subscriptions", {
    plan_id: input.planId,
    ...(input.customerId ? { customer_id: input.customerId } : {}),
    total_count: totalCountFor(input.interval),
    quantity: 1,
    customer_notify: 1,
    ...(input.startAt ? { start_at: input.startAt } : {}),
    notes: input.notes,
  });
}

export async function fetchSubscription(id: string): Promise<RazorpaySubscription> {
  return call<RazorpaySubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);
}

export async function cancelRazorpaySubscription(id: string, atCycleEnd: boolean): Promise<RazorpaySubscription> {
  return call<RazorpaySubscription>("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
}

/** Switches the subscription's plan, now or at the end of the current cycle. */
export async function updateSubscriptionPlan(id: string, planId: string, when: "now" | "cycle_end", interval: BillingInterval): Promise<RazorpaySubscription> {
  return call<RazorpaySubscription>("PATCH", `/subscriptions/${encodeURIComponent(id)}`, {
    plan_id: planId,
    schedule_change_at: when,
    customer_notify: 1,
    remaining_count: totalCountFor(interval),
  });
}

/** Undoes a scheduled plan change. */
export async function cancelScheduledChanges(id: string): Promise<RazorpaySubscription> {
  return call<RazorpaySubscription>("POST", `/subscriptions/${encodeURIComponent(id)}/cancel_scheduled_changes`);
}

/** The subscription a Razorpay invoice belongs to (recurring payments reference an invoice). */
export async function fetchInvoiceSubscriptionId(invoiceId: string): Promise<string | null> {
  const inv = await call<{ subscription_id?: string | null }>("GET", `/invoices/${encodeURIComponent(invoiceId)}`);
  return inv.subscription_id ?? null;
}

/** Refunds part of a captured payment (used for the unused part of a period on an immediate upgrade). */
/** Razorpay's own invoices of a subscription (one per charge): the way to find the payments a subscription has taken. */
export async function listSubscriptionInvoices(subscriptionId: string): Promise<{ id: string; status: string; payment_id?: string | null }[]> {
  const res = await call<{ items?: { id: string; status: string; payment_id?: string | null }[] }>("GET", `/invoices?subscription_id=${encodeURIComponent(subscriptionId)}&count=100`);
  return res.items ?? [];
}

/** A one-time payment request (used for top-ups): the customer pays it in Checkout, and the payment carries this order's id. */
export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string | null;
  notes?: Record<string, string> | [];
}
export async function createOrder(input: { amount: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<RazorpayOrder> {
  return call<RazorpayOrder>("POST", "/orders", { amount: input.amount, currency: input.currency, receipt: input.receipt.slice(0, 40), notes: input.notes });
}
export async function fetchOrder(id: string): Promise<RazorpayOrder> {
  return call<RazorpayOrder>("GET", `/orders/${encodeURIComponent(id)}`);
}

/** What Razorpay holds for one payment: how it was paid and whether it captured. */
export async function fetchPayment(id: string): Promise<RazorpayPayment> {
  return call<RazorpayPayment>("GET", `/payments/${encodeURIComponent(id)}`);
}

export async function refundPayment(paymentId: string, amount: number, notes: Record<string, string>): Promise<{ id: string; amount: number }> {
  return call<{ id: string; amount: number }>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount, notes });
}
