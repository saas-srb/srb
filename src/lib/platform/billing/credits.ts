import "server-only";
import { randomUUID } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { taxTotals } from "@/lib/platform/billing/billing-details";
import { createOrder, fetchPayment, razorpayConfigured, razorpayKeyId, verifyOrderSignature, type RazorpayPayment } from "@/lib/platform/billing/razorpay";
import { issueSaasInvoice, type SaasInvoiceRef } from "@/lib/platform/billing/invoices";
import { recordTransaction } from "@/lib/platform/billing/transactions";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { packsCol } from "@/lib/platform/billing/credits-store";
import { downgradeGuarded } from "@/lib/platform/billing/plan-order-rule";
import { formatMoney } from "@/lib/platform/billing/types";
import { formatUnits, packById, packExpiry, serviceDef, type TopupPack } from "@/lib/platform/billing/topup-catalog";

/**
 * Buying a top-up pack: one Razorpay payment for one pack, whenever the Director wants it.
 *   startTopup   → creates a Razorpay ORDER for the pack (price + GST from the billing settings, never from the browser) and remembers it;
 *   confirmTopup → the browser reports the payment: signature checked, the payment fetched from Razorpay (captured, this order, the right
 *                  amount), then `grantTopup`;
 *   grantTopup   → idempotent on the payment id (the browser AND the webhook may both report it): the pack is added, the GST invoice issued
 *                  (which also emails the receipt), the payment written to the history.
 * The webhook (`order.paid` / `payment.captured`) calls `topupFromWebhook`, so a closed tab never loses a paid pack.
 */

const ORDERS = "billing_topup_orders";

interface OrderDoc {
  _id: string; // Razorpay order id
  companyId: string;
  packId: string;
  amount: number;
  net: number;
  currency: string;
  createdAt: Date;
  paidAt: Date | null;
}

async function orders() {
  const c = (await getPlatformDb()).collection<OrderDoc>(ORDERS);
  await c.createIndex({ companyId: 1, createdAt: -1 }).catch(() => {});
  return c;
}

export interface TopupCheckout {
  key: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
}
export type StartTopupResult = { ok: true; checkout: TopupCheckout } | { ok: false; error: string; needsBillingDetails?: boolean };

export async function startTopup(companyId: string, packId: unknown, actorId: string): Promise<StartTopupResult> {
  const pack = packById(packId);
  if (!pack) return { ok: false, error: "Choose one of the packs." };
  if (!(await razorpayConfigured())) return { ok: false, error: "Online payments aren't available yet. Please contact support." };
  const [company, sub, settings] = await Promise.all([getCompany(companyId), getCompanySubscription(companyId), getBillingSettings()]);
  if (!company || !sub) return { ok: false, error: "Unknown workspace." };
  if (company.isPlatformOwner || sub.status === "internal") return { ok: false, error: "Your workspace isn't billed, so it has no limits to add to." };
  if (!downgradeGuarded(sub.status)) return { ok: false, error: "Renew your subscription first: the workspace is read-only, so extra capacity can't be used yet." };
  if (!sub.billingDetails) return { ok: false, error: "Add your billing details first: they go on the GST invoice.", needsBillingDetails: true };

  const { total, net } = taxTotals(pack.price, settings.tax.gstRatePercent, settings.tax.pricesIncludeTax);
  try {
    const order = await createOrder({ amount: total, currency: settings.billing.currency, receipt: `topup_${randomUUID().slice(0, 12)}`, notes: { companyId, packId: pack.id, purpose: "credit_topup", units: String(pack.units) } });
    await (await orders()).insertOne({ _id: order.id, companyId, packId: pack.id, amount: total, net, currency: order.currency, createdAt: new Date(), paidAt: null });
    await recordPlatformAudit({ actorId, action: "topup.start", target: { type: "company", id: companyId }, companyId, details: { packId: pack.id, orderId: order.id, amount: total } });
    return {
      ok: true,
      checkout: { key: await razorpayKeyId(), orderId: order.id, amount: total, currency: order.currency, name: company.name, description: `${formatUnits(pack.service, pack.units)} · one-time top-up · ${formatMoney(total, order.currency)} incl. GST`, prefill: { name: sub.billingDetails.legalName, email: sub.billingDetails.email } },
    };
  } catch (err) {
    console.error("[topup] could not create the order", err);
    return { ok: false, error: "We couldn't start the payment. Please try again in a moment." };
  }
}

export interface TopupResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
export type ConfirmTopupResult = { ok: true; message: string } | { ok: false; error: string };

export async function confirmTopup(companyId: string, response: TopupResponse, actorId: string): Promise<ConfirmTopupResult> {
  const paymentId = String(response?.razorpay_payment_id ?? "");
  const orderId = String(response?.razorpay_order_id ?? "");
  const signature = String(response?.razorpay_signature ?? "");
  if (!(await verifyOrderSignature(orderId, paymentId, signature))) return { ok: false, error: "We couldn't verify this payment. If you were charged, your top-up is added automatically within a few minutes." };
  const order = await (await orders()).findOne({ _id: orderId });
  if (!order || order.companyId !== companyId) return { ok: false, error: "This payment belongs to a different workspace." };
  let payment: RazorpayPayment;
  try {
    payment = await fetchPayment(paymentId);
  } catch {
    return { ok: false, error: "Payment received, but we couldn't confirm it with Razorpay yet. Your top-up is added automatically within a few minutes." };
  }
  const granted = await grantFromPayment(order, payment, actorId);
  return granted.ok ? { ok: true, message: granted.message } : granted;
}

/** Checks the payment really is this order's, captured, for the right amount; then adds the pack. Idempotent. */
async function grantFromPayment(order: OrderDoc, payment: RazorpayPayment, actorId: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  if (payment.order_id !== order._id) return { ok: false, error: "This payment is not for that order." };
  if (payment.status !== "captured") return { ok: false, error: payment.status === "authorized" ? "The payment is authorised and will be captured shortly. Your top-up appears as soon as it is." : "The payment didn't go through." };
  if (payment.amount !== order.amount) return { ok: false, error: "The amount paid doesn't match the order. Please contact support." };
  const pack = packById(order.packId);
  if (!pack) return { ok: false, error: "That pack is no longer sold. Please contact support." };
  const done = await grantTopup({ companyId: order.companyId, pack, order, payment, actorId });
  return { ok: true, message: done.fresh ? `${formatUnits(pack.service, pack.units)} added to your workspace.` : "Your top-up is already added." };
}

async function grantTopup(input: { companyId: string; pack: TopupPack; order: OrderDoc; payment: RazorpayPayment; actorId: string }): Promise<{ fresh: boolean }> {
  const { companyId, pack, order, payment } = input;
  const def = serviceDef(pack.service);
  const now = new Date();
  const col = await packsCol();
  const _id = `pk_${randomUUID()}`;
  try {
    await col.insertOne({
      _id,
      companyId,
      packId: pack.id,
      service: pack.service,
      units: pack.units,
      total: pack.units * def.perUnit,
      remaining: pack.units * def.perUnit,
      amountPaid: payment.amount,
      currency: payment.currency.toUpperCase(),
      paymentId: payment.id,
      orderId: order._id,
      purchasedAt: now,
      expiresAt: packExpiry(now),
      invoiceId: null,
      invoiceNumber: null,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return { fresh: false }; // already granted for this payment
    throw err;
  }
  await (await orders()).updateOne({ _id: order._id }, { $set: { paidAt: now } });

  // The GST invoice (emails the receipt to the billing contact). A failure never takes the pack back: it is audited for the Console to fix.
  let invoice: SaasInvoiceRef | null = null;
  try {
    const settings = await getBillingSettings();
    const amount = settings.tax.pricesIncludeTax ? payment.amount : order.net;
    invoice = await issueSaasInvoice({
      companyId,
      lines: [{ kind: "addon", refId: pack.id, label: `${formatUnits(pack.service, pack.units)} (top-up, valid 12 months)`, amount }],
      paymentRef: payment.id,
      paidAt: now,
      actorId: "system",
    });
    if (invoice) await col.updateOne({ _id }, { $set: { invoiceId: invoice.id, invoiceNumber: invoice.number } });
  } catch (err) {
    console.error(`[topup] invoice for ${payment.id} failed`, err);
    await recordPlatformAudit({ actorId: "system", action: "invoice.issue_failed", target: { type: "company", id: companyId }, companyId, details: { paymentId: payment.id, topup: pack.id, message: err instanceof Error ? err.message.slice(0, 300) : "unknown" } });
  }
  const sub = await getCompanySubscription(companyId);
  await recordTransaction({
    companyId,
    type: "payment",
    amount: payment.amount,
    currency: payment.currency,
    paymentId: payment.id,
    description: `Top-up · ${formatUnits(pack.service, pack.units)}`,
    method: payment.method ?? null,
    invoiceId: invoice?.id ?? null,
    invoiceNumber: invoice?.number ?? null,
    payer: sub?.billingDetails ? { name: sub.billingDetails.legalName, email: sub.billingDetails.email, gstin: sub.billingDetails.gstin } : null,
  });
  await recordPlatformAudit({ actorId: input.actorId, action: "topup.granted", target: { type: "company", id: companyId }, companyId, details: { packId: pack.id, units: pack.units, paymentId: payment.id, amount: payment.amount } });
  return { fresh: true };
}

/** A captured payment reported by Razorpay's webhook: if it belongs to one of our top-up orders the pack is added, otherwise it is not ours. */
export async function topupFromWebhook(payment: RazorpayPayment | null): Promise<{ handled: boolean; detail?: string }> {
  if (!payment?.order_id) return { handled: false };
  const order = await (await orders()).findOne({ _id: payment.order_id });
  if (!order) return { handled: false };
  if (payment.status !== "captured") return { handled: true, detail: `payment ${payment.status}` };
  const res = await grantFromPayment(order, payment, "system");
  return { handled: true, detail: res.ok ? res.message : res.error };
}

// ── What the Usage page shows ────────────────────────────────────────────────

import { creditsOf } from "@/lib/platform/billing/credits-store";
import { TOPUP_SERVICES, packsFor, type TopupView } from "@/lib/platform/billing/topup-catalog";

export async function getTopupView(companyId: string): Promise<TopupView> {
  const [company, sub, settings, credits, live] = await Promise.all([
    getCompany(companyId),
    getCompanySubscription(companyId),
    getBillingSettings(),
    creditsOf(companyId),
    (await packsCol()).find({ companyId, expiresAt: { $gt: new Date() } }).sort({ purchasedAt: -1 }).limit(20).toArray(),
  ]);
  const blocked = !company || !sub ? "Unknown workspace." : company.isPlatformOwner || sub.status === "internal" ? "Your workspace isn't billed, so it has no limits to add to." : !downgradeGuarded(sub.status) ? "Renew your subscription first: the workspace is read-only." : null;
  const currency = settings.billing.currency;
  return {
    blocked,
    gstRatePercent: settings.tax.gstRatePercent,
    services: TOPUP_SERVICES.map((def) => {
      const c = credits.find((x) => x.service === def.key);
      return {
        key: def.key,
        label: def.label,
        noun: def.noun,
        note: def.note,
        consumable: def.consumable,
        remaining: c?.remaining ?? 0,
        usedThisMonth: c?.usedThisMonth ?? 0,
        nextExpiry: c?.nextExpiry ? c.nextExpiry.toISOString() : null,
        packs: packsFor(def.key).map((p) => {
          const t = taxTotals(p.price, settings.tax.gstRatePercent, settings.tax.pricesIncludeTax);
          return { id: p.id, units: p.units, label: formatUnits(p.service, p.units), net: t.net, gst: t.gst, total: t.total, popular: !!p.popular, currency };
        }),
      };
    }),
    active: live
      .filter((p) => (serviceDef(p.service).consumable ? p.remaining > 0 : true))
      .map((p) => {
        const def = serviceDef(p.service);
        const left = def.consumable ? p.remaining / def.perUnit : p.units;
        return { id: p._id, service: p.service, label: formatUnits(p.service, p.units), remainingLabel: def.consumable ? `${formatUnits(p.service, Math.floor(left))} left` : "In use as extra slots", purchasedAt: p.purchasedAt.toISOString(), expiresAt: p.expiresAt.toISOString(), invoiceId: p.invoiceId, invoiceNumber: p.invoiceNumber };
      }),
  };
}
