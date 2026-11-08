/** The subscription payments ledger: shapes and wording (pure: shared by the server, the history page and the receipt). */

/** `setup` = autopay approved for a first charge that comes later (no money moved yet); it has no receipt. */
export type TransactionType = "payment" | "refund" | "failed" | "setup";
export type TransactionStatus = "success" | "failed";

export interface TransactionView {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  /** Smallest currency unit, tax-inclusive. */
  amount: number;
  currency: string;
  at: string;
  description: string;
  method: string | null;
  /** Provider payment id (`pay_…`) and, for a refund, its refund id (`rfnd_…`). */
  reference: string | null;
  refundReference: string | null;
  receiptNumber: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  /** Failure reason, as the provider reported it. */
  reason: string | null;
}

/** "RCT-202610-A1B2C3": month paid + the end of the transaction id. Not a statutory number: the tax invoice is. */
export function receiptNumber(id: string, at: Date): string {
  const ym = `${at.getUTCFullYear()}${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${prefixOf(id)}-${ym}-${id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase()}`;
}
const prefixOf = (id: string) => (id.startsWith("rf_") ? "RFD" : "RCT");

const METHOD: Record<string, string> = { upi: "UPI", card: "Card", netbanking: "Netbanking", wallet: "Wallet", emandate: "eMandate", nach: "NACH", paylater: "Pay later" };
export function methodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return METHOD[method.toLowerCase()] ?? method.charAt(0).toUpperCase() + method.slice(1);
}

export const TYPE_LABEL: Record<TransactionType, string> = { payment: "Payment", refund: "Refund", failed: "Failed payment", setup: "Autopay set up" };

/** Signed amount for the history column: a refund goes back to the customer. */
export function signedAmount(t: Pick<TransactionView, "type" | "amount">): number {
  return t.type === "refund" ? -t.amount : t.amount;
}
