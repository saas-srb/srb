/**
 * GST working for a company, the pure part (no DB): turns invoices and vendor bills into the rows a GST return is prepared from, and a
 * month's figures for GSTR-3B. It re-uses the platform's GSTIN, state-code and CGST / SGST / IGST helpers
 * (`lib/platform/billing/gst.ts`); money here is rupees, and every split is worked in paise so it adds up exactly.
 *
 * Nothing here decides what the law requires. Rates come from the documents, thresholds are not applied, and the set-off of input
 * credit against liability (which the law orders by head) is left to the CA: this prepares the numbers, it does not file.
 */
import { gstinError, normalizeGstin, resolveGstState, splitTax, supplyTypeFor, stateCodeFromGstin, GST_STATE_CODES, type SupplyType } from "@/lib/platform/billing/gst";

export { gstinError, normalizeGstin, GST_STATE_CODES };

const paise = (rupees: number) => Math.round((rupees + Number.EPSILON) * 100);
const rupees = (p: number) => p / 100;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface Registration {
  /** The company's own GSTIN (Settings → Company details). Empty = not registered / not set. */
  gstin: string;
  /** The company's state, used when it has no valid GSTIN. */
  state: string;
}

export interface SupplierState {
  code: string | null;
  name: string | null;
}

export function supplierState(reg: Registration): SupplierState {
  const s = resolveGstState(reg.gstin, reg.state);
  return { code: s?.code ?? null, name: s?.name ?? null };
}

export type GstHead = "cgst" | "sgst" | "igst";
export interface Heads {
  cgst: number;
  sgst: number;
  igst: number;
}
export const zeroHeads = (): Heads => ({ cgst: 0, sgst: 0, igst: 0 });
export const totalOf = (h: Heads) => r2(h.cgst + h.sgst + h.igst);
export function addHeads(a: Heads, b: Heads): Heads {
  return { cgst: r2(a.cgst + b.cgst), sgst: r2(a.sgst + b.sgst), igst: r2(a.igst + b.igst) };
}

/** A tax amount split into heads for one supply (intra-state: CGST + SGST halves; inter-state: IGST). */
export function headsFor(tax: number, supply: SupplyType): Heads {
  const s = splitTax(paise(tax), supply);
  return { cgst: rupees(s.cgst), sgst: rupees(s.sgst), igst: rupees(s.igst) };
}

// ───────────────────────────── outward supplies (sales) ─────────────────────────────

export interface InvoiceLineLike {
  description: string;
  taxRate: number;
  lineTotal: number;
  taxAmount: number;
  hsnSac?: string | null;
}
export interface InvoiceLike {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerId: string;
  customerName: string;
  currency: string;
  items: InvoiceLineLike[];
  discount: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: string;
}
export interface CustomerLike {
  gstin: string | null;
  state: string | null;
}

export type OutwardFlag =
  | "recipient_gstin_invalid"
  | "place_of_supply_unknown"
  | "hsn_sac_missing"
  | "foreign_currency"
  | "tax_on_unregistered_inter_state"
  | "company_state_unknown";

export interface RateLine {
  rate: number;
  taxable: number;
  heads: Heads;
  hsnSac: string | null;
}

export interface OutwardRow {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  /** The recipient's GSTIN when valid; B2B = it has one. */
  recipientGstin: string | null;
  kind: "b2b" | "b2c";
  placeOfSupply: { code: string; name: string } | null;
  supply: SupplyType;
  invoiceValue: number;
  taxable: number;
  heads: Heads;
  lines: RateLine[];
  currency: string;
  flags: OutwardFlag[];
}

/** Sales invoices that count for GST: issued and not cancelled. A draft is not a supply yet. */
export const countsForGst = (status: string) => status !== "draft" && status !== "cancelled" && status !== "void";

export function outwardRow(inv: InvoiceLike, customer: CustomerLike | null, reg: Registration): OutwardRow {
  const supplier = supplierState(reg);
  const flags: OutwardFlag[] = [];
  const gstin = normalizeGstin(customer?.gstin);
  const validGstin = gstin && gstinError(gstin) === null ? gstin : null;
  if (gstin && !validGstin) flags.push("recipient_gstin_invalid");
  // The place of supply of a B2B sale is the recipient's registered state; for others it is where the goods or service go, which the
  // invoice does not record, so the recipient's stated state is used and, when there is none, the supplier's own (flagged).
  const pos = resolveGstState(validGstin, customer?.state) ?? null;
  if (!pos) flags.push("place_of_supply_unknown");
  const placeOfSupply = pos ?? (supplier.code ? { code: supplier.code, name: supplier.name ?? "" } : null);
  const supply = supplyTypeFor(supplier.code, placeOfSupply?.code ?? null);

  const subtotal = inv.subtotal > 0 ? inv.subtotal : inv.items.reduce((n, i) => n + i.lineTotal, 0);
  const ratio = subtotal > 0 ? (subtotal - inv.discount) / subtotal : 0;
  // Group by rate (and HSN / SAC) first, split the tax into heads once per group: CGST and SGST are then equal except for the single
  // odd paisa a group can have, instead of one odd paisa per line.
  const groups = new Map<string, { rate: number; hsnSac: string | null; taxableP: number; taxP: number }>();
  for (const it of inv.items) {
    const hsn = it.hsnSac?.trim() || null;
    if (!hsn && !flags.includes("hsn_sac_missing")) flags.push("hsn_sac_missing");
    const key = `${it.taxRate}|${hsn ?? ""}`;
    const g = groups.get(key) ?? { rate: it.taxRate, hsnSac: hsn, taxableP: 0, taxP: 0 };
    g.taxableP += paise(it.lineTotal * ratio);
    g.taxP += paise(it.taxAmount);
    groups.set(key, g);
  }
  // the taxable value of the invoice is exactly subtotal less discount; any paisa of rounding is put on the biggest group
  const ordered = [...groups.values()].sort((a, b) => a.rate - b.rate);
  const wantTaxable = paise(subtotal - inv.discount);
  const gap = wantTaxable - ordered.reduce((n, g) => n + g.taxableP, 0);
  if (ordered.length > 0 && Math.abs(gap) <= ordered.length) {
    const biggest = ordered.reduce((m, g) => (g.taxableP > m.taxableP ? g : m), ordered[0]);
    biggest.taxableP += gap;
  }
  const lines: RateLine[] = ordered.map((g) => ({ rate: g.rate, hsnSac: g.hsnSac, taxable: rupees(g.taxableP), heads: headsFor(rupees(g.taxP), supply) }));
  const taxableP = ordered.reduce((n, g) => n + g.taxableP, 0);
  const heads = lines.reduce((acc, l) => addHeads(acc, l.heads), zeroHeads());
  if (!supplier.code) flags.push("company_state_unknown");
  if (inv.currency && inv.currency !== "INR") flags.push("foreign_currency");
  if (!validGstin && supply === "inter" && totalOf(heads) > 0) flags.push("tax_on_unregistered_inter_state");

  return {
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    customerName: inv.customerName,
    recipientGstin: validGstin,
    kind: validGstin ? "b2b" : "b2c",
    placeOfSupply,
    supply,
    invoiceValue: r2(inv.totalAmount),
    taxable: r2(rupees(taxableP)),
    heads,
    lines,
    currency: inv.currency || "INR",
    flags,
  };
}

// ───────────────────────────── inward supplies (purchases) ─────────────────────────────

/** What the company decides about the input tax on one bill. Until it decides, a bill is "review" and its credit is not claimed. */
export type ItcDecision = "review" | "eligible" | "blocked" | "ineligible" | "reverse_charge";
export const ITC_DECISIONS: { value: ItcDecision; label: string; help: string }[] = [
  { value: "review", label: "To review", help: "Not decided yet. Not counted as credit." },
  { value: "eligible", label: "Eligible", help: "Credit can be claimed." },
  { value: "blocked", label: "Blocked", help: "Credit is not allowed by law for this kind of purchase (your CA knows which)." },
  { value: "ineligible", label: "Not eligible", help: "No credit: exempt or non-business purchase, or the vendor is not registered." },
  { value: "reverse_charge", label: "Reverse charge", help: "The company pays the tax itself (RCM) and then claims it as credit." },
];

export interface BillLike {
  id: string;
  billNumber: string;
  vendorInvoiceNumber: string | null;
  invoiceDate: string;
  vendorId: string;
  vendorName: string;
  currency: string;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  status: string;
}
export interface VendorLike {
  gstin: string | null;
  state: string | null;
}

export type InwardFlag = "vendor_gstin_missing" | "vendor_gstin_invalid" | "gst_without_vendor_gstin" | "foreign_currency" | "vendor_state_unknown" | "company_state_unknown";

export interface InwardRow {
  billId: string;
  billNumber: string;
  vendorInvoiceNumber: string | null;
  invoiceDate: string;
  vendorName: string;
  vendorGstin: string | null;
  supply: SupplyType;
  taxable: number;
  heads: Heads;
  invoiceValue: number;
  decision: ItcDecision;
  currency: string;
  flags: InwardFlag[];
}

export const billCountsForGst = (status: string) => status !== "cancelled";

export function inwardRow(bill: BillLike, vendor: VendorLike | null, decision: ItcDecision | undefined, reg: Registration): InwardRow {
  const supplier = supplierState(reg);
  const flags: InwardFlag[] = [];
  const gstin = normalizeGstin(vendor?.gstin);
  const valid = gstin && gstinError(gstin) === null ? gstin : null;
  if (!gstin) flags.push("vendor_gstin_missing");
  else if (!valid) flags.push("vendor_gstin_invalid");
  if (bill.gstAmount > 0 && !valid) flags.push("gst_without_vendor_gstin");
  // For a purchase the vendor's state is the place of supply of the supply made to us.
  const vendorState = resolveGstState(valid, vendor?.state)?.code ?? null;
  if (!vendorState) flags.push("vendor_state_unknown");
  if (!supplier.code) flags.push("company_state_unknown");
  const supply = supplyTypeFor(vendorState, supplier.code);
  if (bill.currency && bill.currency !== "INR") flags.push("foreign_currency");
  return {
    billId: bill.id,
    billNumber: bill.billNumber,
    vendorInvoiceNumber: bill.vendorInvoiceNumber,
    invoiceDate: bill.invoiceDate,
    vendorName: bill.vendorName,
    vendorGstin: valid,
    supply,
    taxable: r2(bill.subtotal),
    heads: headsFor(bill.gstAmount, supply),
    invoiceValue: r2(bill.totalAmount),
    decision: decision ?? "review",
    currency: bill.currency || "INR",
    flags,
  };
}

// ───────────────────────────── GSTR-3B working ─────────────────────────────

export interface RateTotal {
  rate: number;
  taxable: number;
  heads: Heads;
}

/** A credit note issued in the month, worked into the same rate lines and heads as the invoice it reduces. All figures are positive and are taken OFF the month's sales. */
export interface CreditNoteAdjustment {
  noteId: string;
  noteNumber: string;
  issuedOn: string;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  taxable: number;
  heads: Heads;
  lines: RateLine[];
}

/** Splits a credit note over the rate lines of its invoice in proportion to each line's value, in paise, so the parts add up to the note. */
export function creditNoteAdjustment(note: { id: string; number: string; issuedOn: string; amount: number }, invoice: OutwardRow): CreditNoteAdjustment | null {
  // the share of each rate line is taken against the lines themselves, so the parts always add up to the note
  const total = invoice.lines.reduce((n, l) => n + paise(l.taxable) + paise(totalOf(l.heads)), 0);
  const amountP = paise(note.amount);
  if (total <= 0 || amountP <= 0 || invoice.lines.length === 0) return null;
  const lines = invoice.lines.map((l) => {
    const lineValueP = paise(l.taxable) + paise(totalOf(l.heads));
    const partP = Math.round((amountP * lineValueP) / total);
    const taxP = lineValueP > 0 ? Math.round((partP * paise(totalOf(l.heads))) / lineValueP) : 0;
    return { rate: l.rate, hsnSac: l.hsnSac, partP, taxP };
  });
  const gap = amountP - lines.reduce((n, l) => n + l.partP, 0);
  if (Math.abs(gap) <= lines.length) {
    const biggest = lines.reduce((m, l) => (l.partP > m.partP ? l : m), lines[0]);
    biggest.partP += gap;
  }
  const out: RateLine[] = lines.map((l) => ({ rate: l.rate, hsnSac: l.hsnSac, taxable: rupees(l.partP - l.taxP), heads: headsFor(rupees(l.taxP), invoice.supply) }));
  return {
    noteId: note.id,
    noteNumber: note.number,
    issuedOn: note.issuedOn,
    customerName: invoice.customerName,
    invoiceNumber: invoice.invoiceNumber,
    amount: r2(note.amount),
    taxable: r2(out.reduce((n, l) => n + l.taxable, 0)),
    heads: out.reduce((acc, l) => addHeads(acc, l.heads), zeroHeads()),
    lines: out,
  };
}

/** A debit note (an extra charge or correction the vendor made on a bill) as an extra purchase with the same tax mix, supply type and credit decision as its bill. */
export function debitNoteAsInward(note: { id: string; number: string; issuedOn: string; amount: number }, bill: InwardRow): InwardRow | null {
  const total = paise(bill.invoiceValue);
  const amountP = paise(note.amount);
  if (total <= 0 || amountP <= 0) return null;
  const taxP = Math.round((amountP * paise(totalOf(bill.heads))) / total);
  return {
    ...bill,
    billId: `dn:${note.id}`,
    billNumber: note.number,
    vendorInvoiceNumber: note.number,
    invoiceDate: note.issuedOn,
    taxable: rupees(amountP - taxP),
    heads: headsFor(rupees(taxP), bill.supply),
    invoiceValue: rupees(amountP),
    flags: [],
  };
}

export interface Gstr3bWorking {
  /** Outward taxable supplies after credit notes: totals and rate-wise. */
  outward: { taxable: number; heads: Heads; byRate: RateTotal[]; invoices: number; creditNotes: { count: number; taxable: number; heads: Heads } };
  /** Input tax credit by decision. Only "eligible" and "reverse_charge" bills are claimed. */
  itc: { claimed: Heads; reverseCharge: Heads; blocked: Heads; ineligible: Heads; toReview: Heads; toReviewBills: number };
  /** Tax the company must pay itself on reverse-charge purchases; it is paid in cash and then claimed back as credit (which is why it is also in `itc.claimed`). */
  reverseChargeLiability: Heads;
  /** Liability (sales after credit notes, plus reverse charge) less claimed credit, head by head, with NO set-off across heads: the order of set-off is for the CA. A negative figure is credit left over. */
  netByHead: Heads;
  flaggedInvoices: number;
  flaggedBills: number;
}

export function gstr3bWorking(outward: OutwardRow[], inward: InwardRow[], adjustments: { creditNotes?: CreditNoteAdjustment[]; debitNotes?: InwardRow[] } = {}): Gstr3bWorking {
  const creditNotes = adjustments.creditNotes ?? [];
  const allInward = [...inward, ...(adjustments.debitNotes ?? [])];
  const byRate = new Map<number, RateTotal>();
  let taxable = 0;
  let heads = zeroHeads();
  for (const o of outward) {
    taxable = r2(taxable + o.taxable);
    heads = addHeads(heads, o.heads);
    for (const l of o.lines) {
      const prev = byRate.get(l.rate);
      byRate.set(l.rate, { rate: l.rate, taxable: r2((prev?.taxable ?? 0) + l.taxable), heads: prev ? addHeads(prev.heads, l.heads) : l.heads });
    }
  }
  const neg = (h: Heads): Heads => ({ cgst: -h.cgst, sgst: -h.sgst, igst: -h.igst });
  let cnTaxable = 0;
  let cnHeads = zeroHeads();
  for (const c of creditNotes) {
    cnTaxable = r2(cnTaxable + c.taxable);
    cnHeads = addHeads(cnHeads, c.heads);
    taxable = r2(taxable - c.taxable);
    heads = addHeads(heads, neg(c.heads));
    for (const l of c.lines) {
      const prev = byRate.get(l.rate) ?? { rate: l.rate, taxable: 0, heads: zeroHeads() };
      byRate.set(l.rate, { rate: l.rate, taxable: r2(prev.taxable - l.taxable), heads: addHeads(prev.heads, neg(l.heads)) });
    }
  }
  const bucket = (d: ItcDecision) => allInward.filter((i) => i.decision === d).reduce((acc, i) => addHeads(acc, i.heads), zeroHeads());
  const eligible = bucket("eligible");
  const rcm = bucket("reverse_charge");
  const claimed = addHeads(eligible, rcm);
  const liability = addHeads(heads, rcm);
  const net: Heads = {
    cgst: r2(liability.cgst - claimed.cgst),
    sgst: r2(liability.sgst - claimed.sgst),
    igst: r2(liability.igst - claimed.igst),
  };
  return {
    outward: { taxable, heads, byRate: [...byRate.values()].sort((a, b) => a.rate - b.rate), invoices: outward.length, creditNotes: { count: creditNotes.length, taxable: cnTaxable, heads: cnHeads } },
    itc: { claimed, reverseCharge: rcm, blocked: bucket("blocked"), ineligible: bucket("ineligible"), toReview: bucket("review"), toReviewBills: allInward.filter((i) => i.decision === "review" && totalOf(i.heads) > 0).length },
    reverseChargeLiability: rcm,
    netByHead: net,
    flaggedInvoices: outward.filter((o) => o.flags.length > 0).length,
    flaggedBills: inward.filter((i) => i.flags.length > 0).length,
  };
}

/** YYYY-MM of a YYYY-MM-DD. */
export const monthOf = (date: string) => date.slice(0, 7);
export const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export { stateCodeFromGstin };
