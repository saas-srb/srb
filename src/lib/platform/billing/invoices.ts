import { platformEvents } from "@/lib/notify/triggers/platform";
import "server-only";
import { randomUUID } from "node:crypto";
import type { Collection } from "mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { COMPANIES_COLLECTION, getCompany, type Company } from "@/lib/platform/tenancy/companies";
import { companyAppBaseUrl } from "@/lib/platform/tenancy/provisioning";
import { getCompanyDetails, type CompanyDetails } from "@/lib/products/talentos/company";
import { getPlan } from "@/lib/platform/billing/plans";
import { getBillingSettings, type PlatformBillingSettings } from "@/lib/platform/billing/settings";
import type { Quote, QuoteLine } from "@/lib/platform/billing/quote";
import { formatMoney, type BillingInterval, type CompanySubscription } from "@/lib/platform/billing/types";
import { GST_STATE_CODES, computeGst, creditNoteAmounts, isValidGstin, normalizeGstin, resolveGstState, type SupplyType, type TaxAmounts } from "@/lib/platform/billing/gst";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { sendEmail } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";

/**
 * SaaS invoices and credit notes the platform issues to its customer companies
 * (platform-level `saas_invoices`).
 *
 *  - `issueSaasInvoice` — the billing/Razorpay workstream calls it on every
 *    successful charge. Idempotent on the provider payment id.
 *  - `issueSaasCreditNote` — refunds / cancellations. Idempotent on the
 *    provider refund id when there is one.
 *  - `markSaasInvoicePaid`, `voidSaasInvoice` — Platform Console actions.
 *
 * EVERY seller, tax and numbering value comes from the Platform Console's
 * billing settings (`getBillingSettings()`): seller legal/trade name, GSTIN,
 * state, address, PAN, email; GST rate, SAC, prices-include-tax; invoice
 * prefix, footer note, terms. They are snapshotted on the document at issue
 * time, together with the buyer's details, so later edits never change an
 * issued invoice.
 *
 * Numbering: `{prefix}/{FY}/{seq}` for invoices (e.g. `SAAS/26-27/00001`, 16 characters at most — GST rule 46)
 * and `CN/{FY}/{seq}` for credit notes, sequential per Indian
 * financial year (April–March, IST) from atomic counters in
 * `platform_settings`. An invoice's number is drawn only after its document
 * has won the unique payment-id insert, so retried or concurrent webhooks for
 * one payment never burn a number.
 *
 * Tax: CGST + SGST when the seller's state equals the buyer's (the buyer's
 * GSTIN state wins over a typed state), IGST otherwise or when the buyer's
 * state is unknown. See `gst.ts` for rounding.
 */

export const SAAS_INVOICES_COLLECTION = "saas_invoices";
const COUNTERS_COLLECTION = "platform_settings";
const IST_OFFSET_MS = 330 * 60_000;
const CREDIT_LOCK_MS = 30_000;
const NUMBERING_CLAIM_MS = 30_000;

export type SaasInvoiceKind = "invoice" | "credit_note";
/** Invoices: unpaid → paid, or unpaid → void. Credit notes are always "issued". */
export type SaasInvoiceStatus = "unpaid" | "paid" | "void" | "issued";

export interface SaasInvoiceParty {
  name: string;
  legalName: string;
  address: string;
  gstin: string | null;
  pan: string | null;
  state: string | null;
  stateCode: string | null;
  email: string | null;
  phone: string | null;
}

export interface SaasInvoiceItem {
  kind: QuoteLine["kind"] | "credit";
  refId: string;
  description: string;
  sac: string;
  quantity: number;
  /** As quoted (pre-tax, or tax-inclusive when the invoice's prices include tax); discounts negative. */
  amount: number;
  /** Taxable value of the line, paise. Lines sum to the document's `taxable`. */
  taxable: number;
}

export interface SaasInvoice {
  _id: string;
  kind: SaasInvoiceKind;
  companyId: string;
  /** Null only in the instant between winning the insert and drawing a number. */
  number: string | null;
  financialYear: string;
  status: SaasInvoiceStatus;
  /** Provider payment id — the idempotency key of a paid invoice. */
  paymentRef: string | null;
  /** Provider refund id — the idempotency key of a credit note (optional). */
  refundRef: string | null;
  planId: string | null;
  planName: string | null;
  interval: BillingInterval | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  couponId: string | null;
  currency: string;
  seller: SaasInvoiceParty;
  buyer: SaasInvoiceParty;
  placeOfSupply: { code: string; name: string } | null;
  supplyType: SupplyType;
  taxRatePercent: number;
  sac: string;
  pricesIncludeTax: boolean;
  items: SaasInvoiceItem[];
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  total: number;
  /** Invoices: what credit notes have reversed so far (recomputed from them). */
  credited: TaxAmounts;
  /** Credit notes: the invoice they reverse. */
  original: { id: string; number: string; issuedAt: Date } | null;
  /** Credit note reason, or why an invoice was voided. */
  reason: string | null;
  footerNote: string;
  terms: string;
  issuedAt: Date;
  paidAt: Date | null;
  voidedAt: Date | null;
  emailedAt: Date | null;
  createdAt: Date;
  createdBy: string;
  /** Serialises credit notes against one invoice. */
  creditLockUntil?: Date | null;
  /** Who may draw this invoice's number (see issueSaasInvoice). */
  numberingUntil?: Date | null;
}

export interface SaasInvoiceRef {
  id: string;
  number: string;
  /** Tax-inclusive total, paise. */
  total: number;
}

const ZERO: TaxAmounts = { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };

let indexesReady: Promise<unknown> | null = null;
async function invoices(): Promise<Collection<SaasInvoice>> {
  const col = (await getPlatformDb()).collection<SaasInvoice>(SAAS_INVOICES_COLLECTION);
  indexesReady ??= Promise.all([
    col.createIndex({ paymentRef: 1 }, { name: "paymentRef_unique", unique: true, partialFilterExpression: { paymentRef: { $type: "string" } } }),
    col.createIndex({ refundRef: 1 }, { name: "refundRef_unique", unique: true, partialFilterExpression: { refundRef: { $type: "string" } } }),
    col.createIndex({ number: 1 }, { name: "number_unique", unique: true, partialFilterExpression: { number: { $type: "string" } } }),
    col.createIndex({ companyId: 1, issuedAt: -1 }),
    col.createIndex({ issuedAt: -1 }),
    col.createIndex({ "original.id": 1 }),
  ]).catch((err) => {
    indexesReady = null;
    throw err;
  });
  await indexesReady;
  return col;
}

/* ─────────────────────────── Helpers ─────────────────────────── */

/** Indian financial year of a moment, in IST: "2026-27" for 1 Apr 2026 – 31 Mar 2027. */
export function financialYear(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS);
  const start = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Draws the next number in a series + financial year (atomic; one counter document each). */
async function nextNumber(series: "invoice" | "credit_note", prefix: string, fy: string): Promise<string> {
  const counters = (await getPlatformDb()).collection<{ _id: string; seq?: number }>(COUNTERS_COLLECTION);
  const id = series === "invoice" ? `saas_invoice_seq:${fy}` : `saas_credit_note_seq:${fy}`;
  const doc = await counters.findOneAndUpdate({ _id: id }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  // GST rule 46 caps a document number at 16 characters: prefix (≤4) + "/26-27/" + 5 digits.
  const seq = String(doc?.seq ?? 1).padStart(5, "0");
  const shortFy = fy.slice(2);
  return series === "invoice" ? `${prefix.slice(0, 4)}/${shortFy}/${seq}` : `CN/${shortFy}/${seq}`;
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

function joinAddress(parts: (string | null | undefined)[]): string {
  return parts.map((s) => (s ?? "").trim()).filter(Boolean).join(", ");
}

/** Invoice dates are legal dates in India: always IST, identical wherever rendered. */
export function formatInvoiceDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function ref(inv: SaasInvoice): SaasInvoiceRef {
  return { id: inv._id, number: inv.number!, total: inv.total };
}

/** The seller is the platform, exactly as set in Platform Console → Tax & invoicing. */
function sellerParty(seller: PlatformBillingSettings["seller"]): SaasInvoiceParty {
  const gstin = isValidGstin(seller.gstin) ? normalizeGstin(seller.gstin) : null;
  const state = resolveGstState(gstin, seller.stateCode);
  return {
    name: seller.tradeName.trim() || seller.legalName.trim(),
    legalName: seller.legalName.trim(),
    address: seller.address.trim(),
    gstin,
    pan: seller.pan.trim() || (gstin ? gstin.slice(2, 12) : null),
    state: state?.name ?? null,
    stateCode: state?.code ?? null,
    email: seller.email.trim() || null,
    phone: seller.phone.trim() || null,
  };
}

function partyFromDetails(c: CompanyDetails, fallbackEmail: string | null): SaasInvoiceParty {
  const gstin = isValidGstin(c.gstin) ? normalizeGstin(c.gstin) : null;
  const state = resolveGstState(gstin, c.state);
  return {
    name: c.name || c.legalName,
    legalName: c.legalName || c.name,
    address: joinAddress([c.addressLine1, c.addressLine2, c.city, c.state, c.postalCode, c.country]),
    gstin,
    pan: c.pan?.trim() || (gstin ? gstin.slice(2, 12) : null),
    state: state?.name ?? (c.state?.trim() || null),
    stateCode: state?.code ?? null,
    email: c.email?.trim() || fallbackEmail,
    phone: c.phone?.trim() || null,
  };
}

async function firstSuperAdminEmail(companyId: string): Promise<string | null> {
  const users = (await getPlatformDb()).collection<{ companyId: string; email: string; roles?: string[]; createdAt?: Date }>("admin_users");
  const u = await users.findOne({ companyId, roles: "super_admin" }, { sort: { createdAt: 1, _id: 1 }, projection: { email: 1 } });
  return u?.email ?? null;
}

/** The buyer: the subscription's billing details when filled in, else the company's HRMS details. */
async function buyerSnapshot(company: Company & { subscription?: CompanySubscription }): Promise<SaasInvoiceParty> {
  const bd = company.subscription?.billingDetails;
  const ownerEmail = await firstSuperAdminEmail(company._id);
  if (bd?.legalName?.trim()) {
    const gstin = isValidGstin(bd.gstin) ? normalizeGstin(bd.gstin) : null;
    if (bd.gstin && !gstin) console.warn(`[saas-invoices] company ${company._id} has an invalid GSTIN on file; invoicing as unregistered`);
    const state = resolveGstState(gstin, bd.state);
    return {
      name: company.name,
      legalName: bd.legalName.trim(),
      address: bd.address?.trim() ?? "",
      gstin,
      pan: gstin ? gstin.slice(2, 12) : null,
      state: state?.name ?? (bd.state?.trim() || null),
      stateCode: state?.code ?? null,
      email: bd.email?.trim() || ownerEmail,
      phone: null,
    };
  }
  const details = await runAsCompany(company._id, () => getCompanyDetails());
  return { ...partyFromDetails(details, ownerEmail), name: company.name, email: ownerEmail ?? (details.email?.trim() || null) };
}

function describeLine(line: QuoteLine, period: { start: Date; end: Date } | null): string {
  if (line.kind === "plan" && period) return `${line.label} — ${formatInvoiceDate(period.start)} to ${formatInvoiceDate(period.end)}`;
  return line.label;
}

async function emailInvoice(inv: SaasInvoice, slug: string): Promise<void> {
  if (!inv.buyer.email || !inv.number || inv.status !== "paid") return;
  const url = `${companyAppBaseUrl(slug)}/commandos/settings/billing/invoices`;
  const period = inv.periodStart && inv.periodEnd ? ` (${formatInvoiceDate(inv.periodStart)} to ${formatInvoiceDate(inv.periodEnd)})` : "";
  const { html, text } = renderEmail({
    brand: inv.seller.name,
    heading: `Invoice ${inv.number}`,
    paragraphs: [
      `Thank you — we've received your payment of ${formatMoney(inv.total, inv.currency)}${inv.planName ? ` for the ${inv.planName} plan` : ""}${period}.`,
      `Your GST tax invoice ${inv.number} is ready to download from your billing settings.`,
    ],
    action: { label: "View invoices", url },
    footnote: inv.paymentRef ? `Payment reference: ${inv.paymentRef}` : undefined,
  });
  const res = await sendEmail({ to: inv.buyer.email, subject: `Invoice ${inv.number} — ${inv.seller.name}`, html, text, event: "billing_invoice", companyId: inv.companyId });
  if (res.ok) await (await invoices()).updateOne({ _id: inv._id }, { $set: { emailedAt: new Date() } });
}

/* ─────────────────────────── Issue ─────────────────────────── */

export interface IssueSaasInvoiceInput {
  companyId: string;
  /**
   * What was charged for: the `Quote` from `quoteCheckout` (its lines — plan,
   * add-ons, discounts — become the invoice lines, at the quote's GST rate).
   * Give `quote` OR `lines`.
   */
  quote?: Quote | null;
  /** Invoice lines when there is no quote (paise; discounts negative). Priced like quote lines. */
  lines?: QuoteLine[] | null;
  /** With `lines`: which plan/interval it is for (taken from the quote otherwise). */
  planId?: string | null;
  interval?: BillingInterval | null;
  /** The subscription period paid for; printed on the plan line. */
  period?: { start: Date; end: Date } | null;
  /** Provider payment id (e.g. Razorpay `pay_…`). THE idempotency key: a second call with it returns the first invoice. */
  paymentRef?: string | null;
  /** When the payment was received. Null/omitted with no paymentRef → an unpaid invoice. */
  paidAt?: Date | null;
  /** Invoice date (decides the FY of the number). Defaults to `paidAt`, else now. */
  issuedAt?: Date;
  /**
   * The amount actually charged (tax-inclusive, paise). When given it must
   * equal the invoice total worked out here, or issuing fails loudly rather
   * than printing an invoice that disagrees with the payment.
   */
  expectedTotal?: number | null;
  /** Who issued it: an admin_users id, or "system" (default) for webhooks. */
  actorId?: string;
}

/**
 * Issues a GST tax invoice. With `paymentRef` + `paidAt` it is a paid
 * invoice-cum-receipt (emailed to the buyer); otherwise it is issued unpaid
 * and can be marked paid later.
 *
 * Idempotent on `paymentRef`: calling it again (webhook retries, duplicate
 * events, races) returns the invoice already issued and emails nothing.
 * Returns null when the company doesn't exist or is the platform owner (never
 * billed). Throws on bad input or incomplete platform billing settings.
 */
export async function issueSaasInvoice(input: IssueSaasInvoiceInput): Promise<SaasInvoiceRef | null> {
  const paymentRef = input.paymentRef ? String(input.paymentRef).trim() : null;
  const col = await invoices();

  const existing = paymentRef ? await col.findOne({ paymentRef }) : null;
  if (existing?.number) return ref(existing);

  let inv: SaasInvoice;
  let company: (Company & { subscription?: CompanySubscription }) | null;
  const actorId = input.actorId ?? "system";
  if (existing) {
    // A previous call won the insert but died before drawing a number — finish it.
    inv = existing;
    company = await getCompany(existing.companyId);
  } else {
    const lines = input.quote?.lines ?? input.lines ?? null;
    if (!lines?.length) throw new Error("issueSaasInvoice: give a quote or at least one line");
    for (const l of lines) if (!Number.isInteger(l.amount)) throw new Error(`issueSaasInvoice: line "${l.label}" amount must be integer paise`);
    if (input.paidAt && !paymentRef) throw new Error("issueSaasInvoice: a paid invoice needs the provider payment id (paymentRef)");

    company = await (await getPlatformDb()).collection<Company & { subscription?: CompanySubscription }>(COMPANIES_COLLECTION).findOne({ _id: input.companyId });
    if (!company || company.isPlatformOwner) return null;

    const settings = await getBillingSettings();
    const seller = sellerParty(settings.seller);
    if (!seller.legalName) throw new Error("Platform billing settings have no seller legal name — set it in Platform Console → Tax & invoicing");
    const buyer = await buyerSnapshot(company);
    const ratePercent = input.quote?.gstRatePercent ?? settings.tax.gstRatePercent;
    const gst = computeGst({
      amounts: lines.map((l) => l.amount),
      ratePercent,
      pricesIncludeTax: settings.tax.pricesIncludeTax,
      sellerStateCode: seller.stateCode,
      buyerStateCode: buyer.stateCode,
    });
    if (gst.total <= 0) throw new Error("issueSaasInvoice: invoice total must be more than zero");
    if (input.expectedTotal != null && input.expectedTotal !== gst.total) {
      throw new Error(`issueSaasInvoice: charged ${input.expectedTotal} but the invoice works out to ${gst.total} (paise) — check the quote and tax settings`);
    }

    const planId = input.quote?.planId ?? input.planId ?? lines.find((l) => l.kind === "plan")?.refId ?? null;
    const plan = planId ? await getPlan(planId) : null;
    const paidAt = paymentRef ? (input.paidAt ?? new Date()) : null;
    const issuedAt = input.issuedAt ?? paidAt ?? new Date();
    const period = input.period ?? null;
    const sac = settings.tax.sacCode;
    inv = {
      _id: randomUUID(),
      kind: "invoice",
      companyId: company._id,
      number: null,
      financialYear: financialYear(issuedAt),
      status: paidAt ? "paid" : "unpaid",
      paymentRef,
      refundRef: null,
      planId,
      planName: plan?.name ?? planId,
      interval: input.quote?.interval ?? input.interval ?? null,
      periodStart: period?.start ?? null,
      periodEnd: period?.end ?? null,
      couponId: input.quote?.couponId ?? null,
      currency: input.quote?.currency || settings.billing.currency || "INR",
      seller,
      buyer,
      placeOfSupply: buyer.stateCode ? { code: buyer.stateCode, name: GST_STATE_CODES[buyer.stateCode] ?? buyer.state ?? "" } : null,
      supplyType: gst.supplyType,
      taxRatePercent: ratePercent,
      sac,
      pricesIncludeTax: settings.tax.pricesIncludeTax,
      items: lines.map((l, i) => ({ kind: l.kind, refId: l.refId, description: describeLine(l, period), sac, quantity: 1, amount: l.amount, taxable: gst.lineTaxable[i] })),
      taxable: gst.taxable,
      cgst: gst.cgst,
      sgst: gst.sgst,
      igst: gst.igst,
      taxTotal: gst.tax,
      total: gst.total,
      credited: { ...ZERO },
      original: null,
      reason: null,
      footerNote: settings.invoice.footerNote,
      terms: settings.invoice.terms,
      issuedAt,
      paidAt,
      voidedAt: null,
      emailedAt: null,
      createdAt: new Date(),
      createdBy: actorId,
    };
    try {
      await col.insertOne(inv);
    } catch (err) {
      if (!isDuplicateKey(err) || !paymentRef) throw err;
      // Lost a race for this payment: the winner numbers and emails it.
      const winner = await col.findOne({ paymentRef });
      if (winner?.number) return ref(winner);
      if (!winner) throw err;
      inv = winner;
    }
  }

  // Exactly one caller draws the number: whoever claims the unnumbered
  // document. Everyone else (race losers, early retries) waits for it.
  const claimed = await col.findOneAndUpdate(
    { _id: inv._id, number: null, $or: [{ numberingUntil: null }, { numberingUntil: { $lt: new Date() } }] },
    { $set: { numberingUntil: new Date(Date.now() + NUMBERING_CLAIM_MS) } },
    { returnDocument: "after" },
  );
  if (!claimed) {
    for (let i = 0; i < 50; i++) {
      const current = await col.findOne({ _id: inv._id });
      if (current?.number) return ref(current);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`issueSaasInvoice: invoice ${inv._id} is still being numbered by another call — retry`);
  }
  const prefix = (await getBillingSettings()).invoice.prefix;
  const number = await nextNumber("invoice", prefix, inv.financialYear);
  const numbered = await col.findOneAndUpdate({ _id: inv._id, number: null }, { $set: { number, numberingUntil: null } }, { returnDocument: "after" });
  if (!numbered) {
    const current = await col.findOne({ _id: inv._id });
    console.error(`[saas-invoices] number ${number} drawn but invoice ${inv._id} was numbered concurrently — sequence has a gap`);
    return current?.number ? ref(current) : null;
  }
  await recordPlatformAudit({
    actorId,
    action: "invoice.issue",
    target: { type: "saas_invoice", id: numbered._id },
    companyId: numbered.companyId,
    details: { number, total: numbered.total, status: numbered.status, paymentRef: numbered.paymentRef },
  });
  if (company) await emailInvoice(numbered, company.slug).catch((err) => console.error("[saas-invoices] email failed", err));
  await platformEvents.invoice("issued", numbered.number ?? null, (company as { name?: string } | null)?.name ?? numbered.companyId, Number((numbered as { total?: number }).total ?? 0), numbered._id);
  return ref(numbered);
}

/* ─────────────────────────── Product actions ─────────────────────────── */

export type InvoiceActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Unpaid → paid. `paymentRef` (e.g. a bank transfer reference) must not already be on another invoice. */
export async function markSaasInvoicePaid(id: string, opts: { paymentRef?: string | null; paidAt?: Date; actorId: string }): Promise<InvoiceActionResult> {
  const col = await invoices();
  const inv = await getSaasInvoice(id);
  if (!inv || inv.kind !== "invoice") return { ok: false, error: "Invoice not found." };
  if (inv.status !== "unpaid") return { ok: false, error: `This invoice is ${inv.status}, not unpaid.` };
  const paymentRef = opts.paymentRef?.trim().slice(0, 120) || `manual:${inv._id}`;
  const paidAt = opts.paidAt ?? new Date();
  let updated: SaasInvoice | null;
  try {
    updated = await col.findOneAndUpdate({ _id: inv._id, status: "unpaid" }, { $set: { status: "paid", paidAt, paymentRef } }, { returnDocument: "after" });
  } catch (err) {
    if (isDuplicateKey(err)) return { ok: false, error: "That payment reference is already on another invoice." };
    throw err;
  }
  if (!updated) return { ok: false, error: "This invoice changed meanwhile — reload and try again." };
  await recordPlatformAudit({ actorId: opts.actorId, action: "invoice.mark_paid", target: { type: "saas_invoice", id: inv._id }, companyId: inv.companyId, details: { number: inv.number, paymentRef, from: "unpaid", to: "paid" } });
  const company = await getCompany(inv.companyId);
  if (company) await emailInvoice(updated, company.slug).catch((err) => console.error("[saas-invoices] email failed", err));
  return { ok: true };
}

/**
 * Voids an UNPAID invoice (issued in error, never paid). The number stays
 * used — GST numbering has no reuse. A paid invoice is reversed with a credit
 * note instead.
 */
export async function voidSaasInvoice(id: string, opts: { reason: string; actorId: string }): Promise<InvoiceActionResult> {
  const reason = opts.reason.trim().slice(0, 500);
  if (!reason) return { ok: false, error: "Give a reason for voiding." };
  const inv = await getSaasInvoice(id);
  if (!inv || inv.kind !== "invoice") return { ok: false, error: "Invoice not found." };
  if (inv.status === "paid") return { ok: false, error: "A paid invoice can't be voided — issue a credit note instead." };
  if (inv.status !== "unpaid") return { ok: false, error: `This invoice is already ${inv.status}.` };
  const res = await (await invoices()).updateOne({ _id: inv._id, status: "unpaid" }, { $set: { status: "void", voidedAt: new Date(), reason } });
  if (!res.modifiedCount) return { ok: false, error: "This invoice changed meanwhile — reload and try again." };
  await recordPlatformAudit({ actorId: opts.actorId, action: "invoice.void", target: { type: "saas_invoice", id: inv._id }, companyId: inv.companyId, details: { number: inv.number, reason, from: "unpaid", to: "void" } });
  return { ok: true };
}

export interface IssueCreditNoteInput {
  invoiceId: string;
  /** Tax-inclusive paise to credit; defaults to everything not yet credited. */
  amount?: number | null;
  reason: string;
  /** Provider refund id (e.g. Razorpay `rfnd_…`) — the idempotency key when given. */
  refundRef?: string | null;
  issuedAt?: Date;
  actorId: string;
}

async function sumCredits(col: Collection<SaasInvoice>, invoiceId: string): Promise<TaxAmounts> {
  const [a] = await col
    .aggregate<TaxAmounts>([
      { $match: { kind: "credit_note", "original.id": invoiceId } },
      { $group: { _id: null, taxable: { $sum: "$taxable" }, cgst: { $sum: "$cgst" }, sgst: { $sum: "$sgst" }, igst: { $sum: "$igst" }, total: { $sum: "$total" } } },
      { $project: { _id: 0 } },
    ])
    .toArray();
  return a ?? { ...ZERO };
}

/**
 * Issues a GST credit note against a PAID invoice (refund, cancellation,
 * goodwill). Full by default; partial credits are split in the invoice's own
 * taxable : tax proportion, and never exceed what's left in total or in any
 * tax head. Credit notes against one invoice are serialised by a short lock,
 * and what's been credited is recomputed from the credit notes themselves.
 */
export async function issueSaasCreditNote(input: IssueCreditNoteInput): Promise<InvoiceActionResult<{ creditNote: SaasInvoiceRef }>> {
  const reason = input.reason.trim().slice(0, 500);
  if (!reason) return { ok: false, error: "Give a reason for the credit note." };
  const refundRef = input.refundRef ? String(input.refundRef).trim() : null;
  const col = await invoices();
  if (refundRef) {
    const done = await col.findOne({ refundRef });
    if (done?.number) return { ok: true, creditNote: ref(done) };
  }
  const inv = await getSaasInvoice(input.invoiceId);
  if (!inv || inv.kind !== "invoice") return { ok: false, error: "Invoice not found." };
  if (inv.status !== "paid") return { ok: false, error: inv.status === "unpaid" ? "Void an unpaid invoice instead of crediting it." : `This invoice is ${inv.status}.` };

  const now = new Date();
  const locked = await col.findOneAndUpdate(
    { _id: inv._id, $or: [{ creditLockUntil: null }, { creditLockUntil: { $lt: now } }] },
    { $set: { creditLockUntil: new Date(now.getTime() + CREDIT_LOCK_MS) } },
  );
  if (!locked) return { ok: false, error: "Another credit note for this invoice is being issued — try again in a moment." };
  try {
    if (refundRef) {
      const done = await col.findOne({ refundRef });
      if (done?.number) return { ok: true, creditNote: ref(done) };
    }
    const credited = await sumCredits(col, inv._id);
    const remaining: TaxAmounts = { taxable: inv.taxable - credited.taxable, cgst: inv.cgst - credited.cgst, sgst: inv.sgst - credited.sgst, igst: inv.igst - credited.igst, total: inv.total - credited.total };
    if (remaining.total <= 0) return { ok: false, error: "This invoice has already been fully credited." };
    const amount = input.amount ?? remaining.total;
    if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "Enter an amount more than zero." };
    if (amount > remaining.total) return { ok: false, error: `You can credit at most ${formatMoney(remaining.total, inv.currency)} more on this invoice.` };
    const part = creditNoteAmounts(remaining, amount, inv.supplyType);

    const settings = await getBillingSettings();
    const issuedAt = input.issuedAt ?? now;
    const fy = financialYear(issuedAt);
    const number = await nextNumber("credit_note", settings.invoice.prefix, fy);
    const note: SaasInvoice = {
      ...inv,
      _id: randomUUID(),
      kind: "credit_note",
      number,
      financialYear: fy,
      status: "issued",
      paymentRef: null,
      refundRef,
      items: [{ kind: "credit", refId: inv._id, description: `${amount === inv.total ? "Full" : "Partial"} credit against invoice ${inv.number} — ${reason}`, sac: inv.sac, quantity: 1, amount: part.taxable, taxable: part.taxable }],
      taxable: part.taxable,
      cgst: part.cgst,
      sgst: part.sgst,
      igst: part.igst,
      taxTotal: part.cgst + part.sgst + part.igst,
      total: part.total,
      credited: { ...ZERO },
      original: { id: inv._id, number: inv.number!, issuedAt: inv.issuedAt },
      reason,
      // The seller/buyer/tax treatment follow the original invoice; texts are today's.
      footerNote: settings.invoice.footerNote,
      terms: settings.invoice.terms,
      issuedAt,
      paidAt: null,
      voidedAt: null,
      emailedAt: null,
      createdAt: now,
      createdBy: input.actorId,
      creditLockUntil: null,
    };
    try {
      await col.insertOne(note);
    } catch (err) {
      if (isDuplicateKey(err) && refundRef) {
        const done = await col.findOne({ refundRef });
        if (done?.number) return { ok: true, creditNote: ref(done) };
      }
      throw err;
    }
    const after: TaxAmounts = { taxable: credited.taxable + part.taxable, cgst: credited.cgst + part.cgst, sgst: credited.sgst + part.sgst, igst: credited.igst + part.igst, total: credited.total + part.total };
    await col.updateOne({ _id: inv._id }, { $set: { credited: after } });
    await recordPlatformAudit({
      actorId: input.actorId,
      action: "invoice.credit_note",
      target: { type: "saas_invoice", id: note._id },
      companyId: inv.companyId,
      details: { number, invoice: inv.number, amount: part.total, reason, refundRef, fullyCredited: after.total === inv.total },
    });
    return { ok: true, creditNote: ref(note) };
  } finally {
    await col.updateOne({ _id: inv._id }, { $set: { creditLockUntil: null } });
  }
}

/* ─────────────────────────── Reads ─────────────────────────── */

/** Any invoice or credit note, by id. Platform Console only — tenant code uses `getCompanySaasInvoice`. */
export async function getSaasInvoice(id: string): Promise<SaasInvoice | null> {
  if (typeof id !== "string" || !id || id.length > 64) return null;
  return (await invoices()).findOne({ _id: id, number: { $type: "string" } });
}

/** One of THIS company's invoices/credit notes; another company's id is simply not found. */
export async function getCompanySaasInvoice(companyId: string, id: string): Promise<SaasInvoice | null> {
  if (typeof id !== "string" || !id || id.length > 64 || typeof companyId !== "string" || !companyId) return null;
  return (await invoices()).findOne({ _id: id, companyId, number: { $type: "string" } });
}

/**
 * The document a viewer may download: platform admins any, everyone else only
 * their own company's. Used by the PDF route.
 */
export async function getSaasInvoiceForViewer(id: string, viewer: { companyId: string | null; isPlatformAdmin: boolean }): Promise<SaasInvoice | null> {
  if (viewer.isPlatformAdmin) return getSaasInvoice(id);
  return viewer.companyId ? getCompanySaasInvoice(viewer.companyId, id) : null;
}

/** A company's invoices and credit notes, newest first. */
export async function listCompanySaasInvoices(companyId: string): Promise<SaasInvoice[]> {
  return (await invoices()).find({ companyId, number: { $type: "string" } }).sort({ issuedAt: -1, _id: -1 }).limit(500).toArray();
}

/** Credit notes issued against an invoice, oldest first. */
export async function listCreditNotes(invoiceId: string): Promise<SaasInvoice[]> {
  return (await invoices()).find({ kind: "credit_note", "original.id": invoiceId, number: { $type: "string" } }).sort({ issuedAt: 1, _id: 1 }).toArray();
}

export interface SaasInvoiceFilter {
  /** Invoice number, payment/refund ref, buyer legal name or company name/slug (substring, case-insensitive). */
  q?: string;
  companyId?: string;
  status?: "paid" | "unpaid" | "void";
  kind?: SaasInvoiceKind;
  /** "2026-27" */
  fy?: string;
  /** "yyyy-mm-dd", IST, inclusive. */
  from?: string;
  to?: string;
}

export interface SaasInvoiceRow extends SaasInvoice {
  companyName: string;
  companySlug: string;
}

export interface SaasInvoiceTotals {
  /** Non-void invoices. */
  invoiceCount: number;
  taxable: number;
  tax: number;
  total: number;
  /** Unpaid invoices' total. */
  outstanding: number;
  /** Credit notes. */
  creditCount: number;
  credited: number;
  creditedTax: number;
  /** total − credited. */
  net: number;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** IST calendar day ("yyyy-mm-dd") → its start in UTC; null for malformed. */
export function istDayStart(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - IST_OFFSET_MS);
  return Number.isNaN(d.getTime()) || new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10) !== day ? null : d;
}

export function isFinancialYear(fy: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(fy);
  return Boolean(m && (Number(m[1]) + 1) % 100 === Number(m[2]));
}

function buildMatch(filter: SaasInvoiceFilter, companyIdsForQ: string[] | null): Record<string, unknown> {
  const match: Record<string, unknown> = { number: { $type: "string" } };
  if (filter.companyId) match.companyId = filter.companyId;
  if (filter.kind) match.kind = filter.kind === "invoice" ? { $ne: "credit_note" } : "credit_note";
  if (filter.status) {
    match.status = filter.status;
    match.kind = { $ne: "credit_note" };
  }
  if (filter.fy && isFinancialYear(filter.fy)) match.financialYear = filter.fy;
  const from = filter.from ? istDayStart(filter.from) : null;
  const to = filter.to ? istDayStart(filter.to) : null;
  if (from || to) match.issuedAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: new Date(to.getTime() + 86_400_000) } : {}) };
  const q = filter.q?.trim();
  if (q) {
    const re = new RegExp(escapeRegex(q.slice(0, 100)), "i");
    match.$or = [{ number: re }, { paymentRef: re }, { refundRef: re }, { "buyer.legalName": re }, { companyId: { $in: companyIdsForQ ?? [] } }];
  }
  return match;
}

/** Every company's invoices and credit notes for the Platform Console, newest first, with company names and totals. */
export async function listSaasInvoices(filter: SaasInvoiceFilter = {}, opts: { page?: number; pageSize?: number } = {}): Promise<{ rows: SaasInvoiceRow[]; total: number; totals: SaasInvoiceTotals }> {
  const db = await getPlatformDb();
  const companies = db.collection<Company>(COMPANIES_COLLECTION);
  const q = filter.q?.trim();
  const companyIdsForQ = q ? await companies.distinct("_id", { $or: [{ name: new RegExp(escapeRegex(q.slice(0, 100)), "i") }, { slug: new RegExp(escapeRegex(q.slice(0, 100)), "i") }] }) : null;
  const match = buildMatch(filter, companyIdsForQ as string[] | null);
  const col = await invoices();
  const pageSize = Math.min(Math.max(1, opts.pageSize ?? 50), 50_000);
  const page = Math.max(1, opts.page ?? 1);
  const [docs, agg] = await Promise.all([
    col.find(match).sort({ issuedAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    col
      .aggregate<{ _id: { kind: string; status: string }; count: number; taxable: number; tax: number; total: number }>([
        { $match: match },
        { $group: { _id: { kind: { $ifNull: ["$kind", "invoice"] }, status: "$status" }, count: { $sum: 1 }, taxable: { $sum: "$taxable" }, tax: { $sum: "$taxTotal" }, total: { $sum: "$total" } } },
      ])
      .toArray(),
  ]);
  const totals: SaasInvoiceTotals = { invoiceCount: 0, taxable: 0, tax: 0, total: 0, outstanding: 0, creditCount: 0, credited: 0, creditedTax: 0, net: 0 };
  let count = 0;
  for (const g of agg) {
    count += g.count;
    if (g._id.kind === "credit_note") {
      totals.creditCount += g.count;
      totals.credited += g.total;
      totals.creditedTax += g.tax;
    } else if (g._id.status !== "void") {
      totals.invoiceCount += g.count;
      totals.taxable += g.taxable;
      totals.tax += g.tax;
      totals.total += g.total;
      if (g._id.status === "unpaid") totals.outstanding += g.total;
    }
  }
  totals.net = totals.total - totals.credited;
  const names = new Map((await companies.find({ _id: { $in: [...new Set(docs.map((d) => d.companyId))] } }, { projection: { name: 1, slug: 1 } }).toArray()).map((c) => [c._id, c]));
  return {
    rows: docs.map((d) => ({ ...d, companyName: names.get(d.companyId)?.name ?? d.buyer.name, companySlug: names.get(d.companyId)?.slug ?? "" })),
    total: count,
    totals,
  };
}

/** Companies that have at least one invoice, for the filter picker. */
export async function listInvoicedCompanies(): Promise<{ id: string; name: string }[]> {
  const ids = await (await invoices()).distinct("companyId", { number: { $type: "string" } });
  const rows = await (await getPlatformDb()).collection<Company>(COMPANIES_COLLECTION).find({ _id: { $in: ids } }, { projection: { name: 1 } }).sort({ name: 1 }).toArray();
  return rows.map((c) => ({ id: c._id, name: c.name }));
}

/** Financial years that have documents, newest first. */
export async function listInvoiceFinancialYears(): Promise<string[]> {
  const fys = (await (await invoices()).distinct("financialYear", { number: { $type: "string" } })) as string[];
  return fys.filter(isFinancialYear).sort().reverse();
}
