import { normalizeInvoiceRef } from "@/lib/products/cashflow-ai/hygiene-core";

/**
 * Party reconciliation, the pure part: a statement of account for one customer or vendor, how old
 * their open items are, what looks wrong, and why our figure might differ from theirs.
 *
 * One sign rule for both sides keeps the code honest: a "charge" raises what is owed between us
 * (an invoice we raised, a bill we received, a refund we paid back, a debit note) and a
 * "settlement" lowers it (a receipt, a payment, a credit note). A positive balance is the normal
 * direction for both a customer (they owe us) and a vendor (we owe them); a negative one is unusual.
 * All sums are done in whole paise so rupee totals never drift.
 */

export type PartyKind = "customer" | "vendor";
export type DocType = "invoice" | "bill" | "receipt" | "payment" | "credit_note" | "debit_note" | "refund";

export const DOC_LABEL: Record<DocType, string> = {
  invoice: "Invoice",
  bill: "Bill",
  receipt: "Receipt",
  payment: "Payment",
  credit_note: "Credit note",
  debit_note: "Debit note",
  refund: "Refund",
};

const CHARGE_TYPES: readonly DocType[] = ["invoice", "bill", "debit_note", "refund"];
export const isCharge = (t: DocType) => CHARGE_TYPES.includes(t);

/** Only rupee documents are reconciled together; any other currency is listed apart and never added in. */
export const BASE_CURRENCY = "INR";

/** Ageing is counted from the DUE date. Upper edge (in days past due) of each bucket except the last. */
export const AGEING_EDGES = [0, 30, 60, 90] as const;
export const AGEING_LABELS = ["Not yet due", "1-30 days", "31-60 days", "61-90 days", "Over 90 days"] as const;

/** An item still open this many days after it fell due is raised for review. A review habit, not a legal limit. */
export const OLD_ITEM_DAYS = 180;

export interface PartyDoc {
  id: string;
  type: DocType;
  number: string;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM-DD; invoices and bills only. Without one the item is due on its own date. */
  dueDate: string | null;
  /** The vendor's own bill number, when we hold one. */
  vendorRef: string | null;
  /** Bank / cheque / UTR reference of a money movement. */
  reference: string | null;
  /** Always positive. */
  amount: number;
  currency: string;
  /** For a settlement: which charges it was applied to. */
  allocations: { docId: string; amount: number }[];
  /** A receipt's unapplied part (an advance). */
  unallocated: number;
  /** What the source record itself says is already settled, to catch a record that drifted from its documents. */
  recordedSettled: number | null;
}

/** A document that exists but is deliberately NOT counted (a cheque still to clear, or one that bounced). */
export interface HeldDoc {
  number: string;
  date: string;
  amount: number;
  reason: string;
}

const paise = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);
const rupees = (p: number) => p / 100;
const effectP = (d: PartyDoc) => (isCharge(d.type) ? paise(d.amount) : -paise(d.amount));
/** What this document does to the balance, in rupees (negative for a settlement). */
export const signedEffect = (d: PartyDoc) => rupees(effectP(d));

const dayNumber = (ymd: string) => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
export const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
export const daysPastDue = (dueDate: string, asOf: string) => dayNumber(asOf) - dayNumber(dueDate);

export function ageingBucketIndex(daysOverdue: number): number {
  for (let i = 0; i < AGEING_EDGES.length; i++) if (daysOverdue <= AGEING_EDGES[i]) return i;
  return AGEING_EDGES.length;
}

// ---------------------------------------------------------------------------
// Statement
// ---------------------------------------------------------------------------

export interface StatementLine {
  docId: string;
  date: string;
  type: DocType;
  number: string;
  description: string;
  /** Raises what is owed. */
  charge: number;
  /** Lowers what is owed. */
  settlement: number;
  balance: number;
}

export interface Statement {
  from: string;
  to: string;
  opening: number;
  lines: StatementLine[];
  totalCharges: number;
  totalSettlements: number;
  closing: number;
  /** Documents left out because they are not in rupees. */
  otherCurrency: { currency: string; count: number }[];
}

function describe(d: PartyDoc): string {
  const alloc = d.allocations.length > 0 ? ` against ${d.allocations.length === 1 ? "1 item" : `${d.allocations.length} items`}` : "";
  if (d.type === "receipt") return `Received${alloc}${d.unallocated > 0.005 ? `, ${rupees(paise(d.unallocated))} not yet applied` : ""}`;
  if (d.type === "bill") return d.vendorRef ? `Bill ${d.vendorRef}` : "Bill";
  if (d.type === "refund") return "Money returned to the customer";
  if (d.type === "payment") return `Paid${d.reference ? ` (${d.reference})` : ""}`;
  return DOC_LABEL[d.type];
}

const TYPE_ORDER: Record<DocType, number> = { invoice: 0, bill: 0, debit_note: 1, refund: 2, receipt: 3, payment: 3, credit_note: 4 };

export function splitCurrency(docs: PartyDoc[]): { counted: PartyDoc[]; otherCurrency: { currency: string; count: number }[] } {
  const counted: PartyDoc[] = [];
  const other = new Map<string, number>();
  for (const d of docs) {
    if ((d.currency || BASE_CURRENCY) === BASE_CURRENCY) counted.push(d);
    else other.set(d.currency, (other.get(d.currency) ?? 0) + 1);
  }
  return { counted, otherCurrency: [...other].map(([currency, count]) => ({ currency, count })).sort((a, b) => a.currency.localeCompare(b.currency)) };
}

/** Balance of all rupee documents dated on or before `asOf`. */
export function balanceAt(docs: PartyDoc[], asOf: string): number {
  let p = 0;
  for (const d of splitCurrency(docs).counted) if (d.date <= asOf) p += effectP(d);
  return rupees(p);
}

export function buildStatement(docs: PartyDoc[], range: { from: string; to: string }): Statement {
  const { counted, otherCurrency } = splitCurrency(docs);
  let openingP = 0;
  const inRange: PartyDoc[] = [];
  for (const d of counted) {
    if (d.date < range.from) openingP += effectP(d);
    else if (d.date <= range.to) inRange.push(d);
  }
  inRange.sort((a, b) => a.date.localeCompare(b.date) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.number.localeCompare(b.number));
  let run = openingP;
  let chargesP = 0;
  let settledP = 0;
  const lines = inRange.map((d): StatementLine => {
    const e = effectP(d);
    run += e;
    if (e >= 0) chargesP += e;
    else settledP += -e;
    return { docId: d.id, date: d.date, type: d.type, number: d.number, description: describe(d), charge: e >= 0 ? rupees(e) : 0, settlement: e < 0 ? rupees(-e) : 0, balance: rupees(run) };
  });
  return { from: range.from, to: range.to, opening: rupees(openingP), lines, totalCharges: rupees(chargesP), totalSettlements: rupees(settledP), closing: rupees(run), otherCurrency };
}

// ---------------------------------------------------------------------------
// Ageing
// ---------------------------------------------------------------------------

export interface OpenItem {
  docId: string;
  type: DocType;
  number: string;
  date: string;
  dueDate: string;
  original: number;
  outstanding: number;
  daysPastDue: number;
  bucket: number;
}

export interface Ageing {
  asOf: string;
  items: OpenItem[];
  /** Amount in each bucket, same order as AGEING_LABELS. */
  buckets: number[];
  totalOpen: number;
  overdue: number;
  /** Money from the party not tied to any open item (advances, over-payments), net of anything returned. */
  onAccount: number;
  /** totalOpen less onAccount: equals the statement balance on that day. */
  net: number;
}

/**
 * What is still open on each invoice/bill on `asOf`, counted from its due date. Only documents dated
 * on or before `asOf` take part, so an ageing run for last month-end is what it was then.
 */
export function buildAgeing(docs: PartyDoc[], asOf: string): Ageing {
  const live = splitCurrency(docs).counted.filter((d) => d.date <= asOf);
  const items = new Map<string, { doc: PartyDoc; p: number }>();
  const itemTypes: DocType[] = ["invoice", "bill"];
  for (const d of live) if (itemTypes.includes(d.type)) items.set(d.id, { doc: d, p: paise(d.amount) });
  for (const d of live) {
    if (d.type === "debit_note") {
      // a debit note tied to a bill makes that bill bigger; one with no bill behind it stands alone
      const target = d.allocations[0] ? items.get(d.allocations[0].docId) : undefined;
      if (target) target.p += paise(d.amount);
      else items.set(d.id, { doc: d, p: paise(d.amount) });
    }
  }
  for (const d of live) {
    if (isCharge(d.type)) continue;
    for (const a of d.allocations) {
      const target = items.get(a.docId);
      if (target) target.p -= paise(a.amount);
    }
  }
  const buckets = AGEING_LABELS.map(() => 0);
  const out: OpenItem[] = [];
  let openP = 0;
  let overdueP = 0;
  for (const { doc, p } of items.values()) {
    if (p === 0) continue;
    const due = doc.dueDate ?? doc.date;
    const days = daysPastDue(due, asOf);
    const b = ageingBucketIndex(days);
    openP += p;
    if (p > 0) {
      buckets[b] += p;
      if (days > 0) overdueP += p;
    }
    out.push({ docId: doc.id, type: doc.type, number: doc.number, date: doc.date, dueDate: due, original: rupees(paise(doc.amount)), outstanding: rupees(p), daysPastDue: days, bucket: b });
  }
  out.sort((a, b) => b.daysPastDue - a.daysPastDue || a.number.localeCompare(b.number));
  const balanceP = live.reduce((n, d) => n + effectP(d), 0);
  return { asOf, items: out, buckets: buckets.map(rupees), totalOpen: rupees(openP), overdue: rupees(overdueP), onAccount: rupees(openP - balanceP), net: rupees(balanceP) };
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

export type FlagCode = "unusual_balance" | "unallocated" | "duplicate" | "possible_duplicate" | "old_unsettled" | "over_settled" | "record_mismatch" | "held" | "other_currency";

export interface Flag {
  code: FlagCode;
  level: "info" | "warn" | "bad";
  message: string;
  docIds: string[];
}

const inr = (n: number) => `Rs ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** `today` lets the check on recorded settled amounts run only for the present day; without it the check always runs. */
export function findFlags(docs: PartyDoc[], kind: PartyKind, asOf: string, held: HeldDoc[] = [], today?: string): Flag[] {
  const { counted, otherCurrency } = splitCurrency(docs);
  const live = counted.filter((d) => d.date <= asOf);
  const flags: Flag[] = [];
  const balance = balanceAt(counted, asOf);

  if (balance < -0.005) {
    flags.push({
      code: "unusual_balance",
      level: "bad",
      message:
        kind === "customer"
          ? `This customer shows a credit balance of ${inr(-balance)}: we hold more of their money than they owe. Check for an advance, a double receipt or a credit note issued twice.`
          : `This vendor shows a debit balance of ${inr(-balance)}: we have paid more than we were billed. Check for a double payment, a missing bill or a refund due from them.`,
      docIds: [],
    });
  }

  const advances = live.filter((d) => d.type === "receipt" && d.unallocated > 0.005);
  if (advances.length > 0) {
    const total = rupees(advances.reduce((n, d) => n + paise(d.unallocated), 0));
    flags.push({ code: "unallocated", level: "warn", message: `${inr(total)} received from this customer has not been applied to any invoice (${advances.map((d) => d.number).join(", ")}). Apply it, or confirm it is a genuine advance.`, docIds: advances.map((d) => d.id) });
  }

  // the same vendor bill entered twice
  const byRef = new Map<string, PartyDoc[]>();
  for (const d of live) {
    if (d.type !== "bill") continue;
    const ref = normalizeInvoiceRef(d.vendorRef);
    if (ref) byRef.set(ref, [...(byRef.get(ref) ?? []), d]);
  }
  const exact = new Set<string>();
  for (const [ref, list] of byRef) {
    if (list.length < 2) continue;
    list.forEach((d) => exact.add(d.id));
    flags.push({ code: "duplicate", level: "bad", message: `Bill number ${list[0].vendorRef ?? ref} is entered ${list.length} times (${list.map((d) => d.number).join(", ")}), so we may owe it only once.`, docIds: list.map((d) => d.id) });
  }
  // same type, date and amount: only worth a look, two real documents can match
  const bySame = new Map<string, PartyDoc[]>();
  for (const d of live) {
    if (d.type === "credit_note" || d.type === "debit_note") continue;
    const k = `${d.type}|${d.date}|${paise(d.amount)}`;
    bySame.set(k, [...(bySame.get(k) ?? []), d]);
  }
  for (const list of bySame.values()) {
    if (list.length < 2 || list.every((d) => exact.has(d.id))) continue;
    // two payments or receipts that carry different references are different movements of money
    if ((list[0].type === "payment" || list[0].type === "receipt") && new Set(list.map((d) => (d.reference ?? "").trim().toUpperCase())).size > 1 && list.every((d) => d.reference)) continue;
    flags.push({ code: "possible_duplicate", level: "warn", message: `${list.length} ${DOC_LABEL[list[0].type].toLowerCase()}s for the same amount (${inr(list[0].amount)}) on ${list[0].date} (${list.map((d) => d.number).join(", ")}). Check they are not the same one entered twice.`, docIds: list.map((d) => d.id) });
  }

  const ageing = buildAgeing(counted, asOf);
  const old = ageing.items.filter((i) => i.outstanding > 0 && i.daysPastDue > OLD_ITEM_DAYS);
  if (old.length > 0) {
    flags.push({ code: "old_unsettled", level: "warn", message: `${old.length === 1 ? "1 item has" : `${old.length} items have`} been open for more than ${OLD_ITEM_DAYS} days past the due date (${old.map((i) => i.number).join(", ")}), ${inr(rupees(old.reduce((n, i) => n + paise(i.outstanding), 0)))} in all. Chase it, get it confirmed, or consider a write-off.`, docIds: old.map((i) => i.docId) });
  }
  const over = ageing.items.filter((i) => i.outstanding < 0);
  if (over.length > 0) {
    flags.push({ code: "over_settled", level: "bad", message: `More has been applied than the document is worth on ${over.map((i) => i.number).join(", ")}. A payment or credit note is probably against the wrong document.`, docIds: over.map((i) => i.docId) });
  }

  // the invoice/bill says one thing about what has been settled, the receipts and payments say another
  const allocatedTo = new Map<string, number>();
  for (const d of live) if (!isCharge(d.type)) for (const a of d.allocations) allocatedTo.set(a.docId, (allocatedTo.get(a.docId) ?? 0) + paise(a.amount));
  const drift = live.filter((d) => (d.type === "invoice" || d.type === "bill") && d.recordedSettled !== null && Math.abs(paise(d.recordedSettled) - (allocatedTo.get(d.id) ?? 0)) > 1);
  // a bill's settled figure is only comparable up to today, so a back-dated run skips it
  if (drift.length > 0 && asOf >= (today ?? asOf)) {
    flags.push({ code: "record_mismatch", level: "warn", message: `${drift.map((d) => d.number).join(", ")} ${drift.length === 1 ? "records" : "record"} a settled amount that differs from the receipts, payments and credit notes against ${drift.length === 1 ? "it" : "them"}. One of them was probably changed by hand.`, docIds: drift.map((d) => d.id) });
  }

  if (held.length > 0) {
    flags.push({ code: "held", level: "info", message: `Not counted in this balance: ${held.map((h) => `${h.number} (${inr(h.amount)}, ${h.reason})`).join("; ")}.`, docIds: [] });
  }
  if (otherCurrency.length > 0) {
    flags.push({ code: "other_currency", level: "info", message: `Left out because they are not in rupees: ${otherCurrency.map((o) => `${o.count} in ${o.currency}`).join(", ")}. They need their own reconciliation.`, docIds: [] });
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Their figure against ours
// ---------------------------------------------------------------------------

export interface Explanation {
  code: "rounding" | "timing" | "single_document" | "two_documents" | "duplicate" | "tds_hint" | "they_hold_more";
  confidence: "exact" | "possible" | "hint";
  message: string;
  docIds: string[];
}

export interface ConfirmationComparison {
  ourAsOf: string;
  theirAsOf: string;
  ourBalance: number;
  theirBalance: number;
  /** Ours less theirs: positive means we show more owed than they do. */
  difference: number;
  matches: boolean;
  explanations: Explanation[];
}

const MATCH_P = 1; // one paisa of slack

/**
 * Compares our balance with the one the other side stated. `theirAsOf` is the date of THEIR statement; `ourAsOf`
 * is the day we compare on (it may be later), which is how a document dated after their statement shows up as a
 * timing difference.
 */
export function compareWithConfirmation(docs: PartyDoc[], input: { kind: PartyKind; theirBalance: number; theirAsOf: string; ourAsOf: string }): ConfirmationComparison {
  const counted = splitCurrency(docs).counted;
  const ourP = counted.filter((d) => d.date <= input.ourAsOf).reduce((n, d) => n + effectP(d), 0);
  const theirP = paise(input.theirBalance);
  const diffP = ourP - theirP;
  const base = { ourAsOf: input.ourAsOf, theirAsOf: input.theirAsOf, ourBalance: rupees(ourP), theirBalance: rupees(theirP), difference: rupees(diffP) };
  if (Math.abs(diffP) <= MATCH_P) return { ...base, matches: true, explanations: [] };

  const out: Explanation[] = [];
  const absDiff = Math.abs(diffP);
  if (absDiff < 100) out.push({ code: "rounding", confidence: "possible", message: `The difference is under Rs 1, which is usually rounding on one side.`, docIds: [] });

  // 1. things dated after their statement
  const after = counted.filter((d) => d.date > input.theirAsOf && d.date <= input.ourAsOf);
  if (after.length > 0) {
    const afterP = after.reduce((n, d) => n + effectP(d), 0);
    const exact = Math.abs(afterP - diffP) <= MATCH_P;
    out.push({
      code: "timing",
      confidence: exact ? "exact" : "possible",
      message: exact
        ? `Everything is explained by ${after.length === 1 ? "a document" : `${after.length} documents`} dated after their statement date (${after.map((d) => `${d.number} on ${d.date}`).join(", ")}). Compare on their date and the figures agree.`
        : `${after.length === 1 ? "A document is" : `${after.length} documents are`} dated after their statement date (${after.map((d) => `${d.number} on ${d.date}`).join(", ")}), together ${afterP >= 0 ? "adding" : "taking off"} ${inr(Math.abs(rupees(afterP)))}. Only part of the difference.`,
      docIds: after.map((d) => d.id),
    });
  }

  // 2. one document, or two, that account for the whole gap
  const upToTheirs = counted.filter((d) => d.date <= input.theirAsOf);
  const kindWord = (d: PartyDoc) => (isCharge(d.type) ? "we hold" : "we recorded");
  const theyMiss = (d: PartyDoc) =>
    isCharge(d.type)
      ? `${DOC_LABEL[d.type].toLowerCase()} ${d.number} (${inr(d.amount)}) may be missing from their books`
      : `${DOC_LABEL[d.type].toLowerCase()} ${d.number} (${inr(d.amount)}) may not be in their books`;
  for (const d of upToTheirs) {
    if (effectP(d) === diffP) out.push({ code: "single_document", confidence: "possible", message: `The difference equals one document ${kindWord(d)}: ${theyMiss(d)}.`, docIds: [d.id] });
  }
  if (out.filter((o) => o.code === "single_document").length === 0 && upToTheirs.length <= 300) {
    let found = 0;
    for (let i = 0; i < upToTheirs.length && found < 3; i++) {
      for (let j = i + 1; j < upToTheirs.length && found < 3; j++) {
        if (effectP(upToTheirs[i]) + effectP(upToTheirs[j]) === diffP) {
          found += 1;
          out.push({ code: "two_documents", confidence: "possible", message: `${upToTheirs[i].number} and ${upToTheirs[j].number} together equal the difference: ${theyMiss(upToTheirs[i])}, and ${theyMiss(upToTheirs[j])}.`, docIds: [upToTheirs[i].id, upToTheirs[j].id] });
        }
      }
    }
  }

  // 3. a document entered twice on our side that equals the gap
  for (const f of findFlags(counted, input.kind, input.theirAsOf)) {
    if (f.code !== "duplicate" && f.code !== "possible_duplicate") continue;
    const docsInGroup = upToTheirs.filter((d) => f.docIds.includes(d.id));
    const extra = docsInGroup.slice(1).reduce((n, d) => n + effectP(d), 0);
    if (docsInGroup.length > 1 && extra === diffP) out.push({ code: "duplicate", confidence: "exact", message: `${f.message} Removing the extra copy would clear the whole difference.`, docIds: f.docIds });
  }

  // 4. things only they can have
  if (diffP < 0) out.push({ code: "they_hold_more", confidence: "hint", message: `They show more owed than we do, by ${inr(rupees(absDiff))}. Ask them for a document list: an item they hold that we have not recorded would explain it.`, docIds: [] });
  if (input.kind === "customer" && diffP > 0) out.push({ code: "tds_hint", confidence: "hint", message: `Customers often pay a little less than the invoice because they deduct tax at source (TDS) and pay it to the government. If their payments were short, ask for the TDS certificate; the difference is then a tax credit, not money owed to you.`, docIds: [] });
  return { ...base, matches: false, explanations: out };
}

// ---------------------------------------------------------------------------
// One call for a page
// ---------------------------------------------------------------------------

export interface PartyAnalysis {
  statement: Statement;
  ageing: Ageing;
  flags: Flag[];
  /** Balance on the end date. */
  balance: number;
}

export function analyseParty(docs: PartyDoc[], kind: PartyKind, range: { from: string; to: string }, held: HeldDoc[] = [], today?: string): PartyAnalysis {
  const statement = buildStatement(docs, range);
  const ageing = buildAgeing(docs, range.to);
  return { statement, ageing, flags: findFlags(docs, kind, range.to, held, today), balance: statement.closing };
}
