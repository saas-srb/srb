/**
 * What must be true of a payment a customer made outside the gateway (cash, cheque, bank transfer) before it is recorded as received.
 * Pure, so the form, the server and the tests all apply the same rules.
 */

/** Section 269ST of the Income-tax Act: a person may not receive ₹2,00,000 or more in cash from one person in a day. The penalty equals the amount received. */
export const CASH_LIMIT_PER_DAY = 200_000;

/** Methods where the bank's own reference (UTR, transaction id) proves the money arrived. */
const REFERENCED = new Set(["bank_transfer", "neft", "rtgs", "imps", "upi", "payment_gateway"]);

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export interface ReceiptRuleInput {
  method: string;
  amount: number;
  currency: string;
  receiptDate: string;
  reference: string | null;
  chequeNumber?: string | null;
  chequeDate?: string | null;
  chequeBank?: string | null;
  /** Cash already received from this customer on this date (completed or waiting). */
  cashToday?: number;
}

export function checkReceiptRules(i: ReceiptRuleInput): string | null {
  if (i.method === "cash") {
    if (i.currency === "INR" && (i.cashToday ?? 0) + i.amount >= CASH_LIMIT_PER_DAY) {
      return `Cash of ₹2,00,000 or more from one person in a day cannot be received (section 269ST of the Income-tax Act). ${(i.cashToday ?? 0) > 0 ? `₹${(i.cashToday ?? 0).toLocaleString("en-IN")} has already been received from this customer today. ` : ""}Ask for a bank transfer or a cheque instead.`;
    }
    return null;
  }
  if (i.method === "cheque") {
    if (!/^\d{6}$/.test((i.chequeNumber ?? "").trim())) return "Enter the cheque number: six digits, as printed on the cheque.";
    if (!(i.chequeBank ?? "").trim()) return "Enter the bank the cheque is drawn on.";
    if (!i.chequeDate || !/^\d{4}-\d{2}-\d{2}$/.test(i.chequeDate)) return "Enter the date written on the cheque.";
    if (daysBetween(i.chequeDate, i.receiptDate) > 90) return "A cheque is valid for three months from its date. This one is older, so the bank will not clear it.";
    if (daysBetween(i.receiptDate, i.chequeDate) > 90) return "That cheque is dated more than three months ahead.";
    return null;
  }
  if (REFERENCED.has(i.method) && (i.reference ?? "").trim().length < 6) {
    return "Enter the bank's reference for this payment (UTR or transaction id, at least 6 characters). It is how the money is matched to your bank statement.";
  }
  return null;
}
