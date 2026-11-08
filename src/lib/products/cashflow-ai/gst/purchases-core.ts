/**
 * The purchases register, the pure part: totals for the summary cards and the plain-English meaning of each flag. The totals are
 * worked from the same rows the table shows, so cards and table can never disagree. Nothing here decides which purchases are
 * blocked or which are reverse charge: that stays the company's (and its CA's) call.
 */
import { addHeads, totalOf, zeroHeads, ITC_DECISIONS, type Heads, type InwardFlag, type InwardRow, type ItcDecision } from "@/lib/products/cashflow-ai/gst/core";

/** A bill needs a decision only when it carries GST; a bill with no tax has no credit to decide on. */
export const carriesGst = (row: InwardRow) => totalOf(row.heads) > 0;

export interface Bucket {
  /** Bills that carry GST in this bucket. */
  count: number;
  heads: Heads;
  total: number;
}

export interface PurchasesSummary {
  /** Eligible + reverse charge: the credit that is counted. */
  claimed: Bucket;
  eligible: Bucket;
  reverseCharge: Bucket;
  blocked: Bucket;
  ineligible: Bucket;
  /** Not decided yet: not counted as credit. */
  toReview: Bucket;
  /** Every bill's GST, whatever its decision. claimed + blocked + ineligible + toReview always equals this. */
  all: Bucket;
  bills: number;
  billsWithoutGst: number;
}

const empty = (): Bucket => ({ count: 0, heads: zeroHeads(), total: 0 });
function add(b: Bucket, row: InwardRow): Bucket {
  const heads = addHeads(b.heads, row.heads);
  return { count: b.count + 1, heads, total: totalOf(heads) };
}

export function summarisePurchases(rows: InwardRow[]): PurchasesSummary {
  const by: Record<ItcDecision, Bucket> = { review: empty(), eligible: empty(), blocked: empty(), ineligible: empty(), reverse_charge: empty() };
  let all = empty();
  let billsWithoutGst = 0;
  for (const r of rows) {
    if (!carriesGst(r)) {
      billsWithoutGst += 1;
      continue;
    }
    by[r.decision] = add(by[r.decision], r);
    all = add(all, r);
  }
  const claimedHeads = addHeads(by.eligible.heads, by.reverse_charge.heads);
  return {
    claimed: { count: by.eligible.count + by.reverse_charge.count, heads: claimedHeads, total: totalOf(claimedHeads) },
    eligible: by.eligible,
    reverseCharge: by.reverse_charge,
    blocked: by.blocked,
    ineligible: by.ineligible,
    toReview: by.review,
    all,
    bills: rows.length,
    billsWithoutGst,
  };
}

export const decisionLabel = (d: ItcDecision) => ITC_DECISIONS.find((x) => x.value === d)?.label ?? d;

/** What a flag means, in words a non-accountant can act on. */
export const FLAG_TEXT: Record<InwardFlag, { title: string; detail: string }> = {
  vendor_gstin_missing: { title: "Vendor GSTIN missing", detail: "The vendor has no GSTIN on file. Ask them for it and add it to the vendor, or confirm with your CA that they are not registered." },
  vendor_gstin_invalid: { title: "Vendor GSTIN looks wrong", detail: "The GSTIN saved for this vendor is not a valid GSTIN (check the number and its last character). Correct it on the vendor." },
  gst_without_vendor_gstin: { title: "GST charged, but the vendor has no valid GSTIN", detail: "The bill carries GST, yet we cannot see a valid GSTIN for the vendor. Credit usually needs the vendor's GSTIN, so check the bill with the vendor or your CA before marking it Eligible." },
  vendor_state_unknown: { title: "Vendor's state not known", detail: "The vendor has no valid GSTIN or state saved, so whether the tax is CGST + SGST or IGST is a guess (IGST is assumed). Add the vendor's state." },
  company_state_unknown: { title: "Your own state is not set", detail: "Your company's GSTIN or state is missing, so the CGST / SGST / IGST split of purchases cannot be worked out reliably. Add them in Settings → Company details." },
  foreign_currency: { title: "Bill is not in rupees", detail: "Amounts here are shown as entered on the bill, not converted to rupees. Check them with your CA before using them in a return." },
};

/** The previous calendar month's YYYY-MM for a YYYY-MM-DD "today". */
export function previousMonthOf(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
