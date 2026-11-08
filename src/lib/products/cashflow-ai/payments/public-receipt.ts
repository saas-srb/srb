import "server-only";
import { getPaymentLinkByToken } from "@/lib/products/cashflow-ai/payments/links";
import { getPaymentIntent } from "@/lib/products/cashflow-ai/payments/intents";

/** What a customer sees (and downloads) as proof of a payment made through a payment link. */
export interface PublicReceipt {
  number: string;
  paymentNumber: string;
  paidAt: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  title: string;
  method: string;
  gatewayPaymentId: string | null;
  utr: string | null;
}

const METHODS: Record<string, string> = { UPI: "UPI", CARD: "Card", NET_BANKING: "Net banking", NETBANKING: "Net banking", WALLET: "Wallet", BANK_TRANSFER: "Bank transfer" };

/**
 * The receipt of the payment that paid this link, found by the link's secret token, so only the person who holds the link can see it. `null`
 * until the link has been paid.
 */
export async function receiptForLinkToken(token: string): Promise<PublicReceipt | null> {
  const link = await getPaymentLinkByToken(token);
  if (!link || link.status !== "PAID" || !link.paymentIntentId) return null;
  const intent = await getPaymentIntent(link.paymentIntentId);
  if (!intent || intent.status !== "SUCCESS") return null;
  return {
    number: intent.receiptNumber ?? intent.paymentNumber,
    paymentNumber: intent.paymentNumber,
    paidAt: (intent.completedAt ?? intent.updatedAt).toISOString(),
    amount: intent.netAmount,
    currency: intent.currency,
    customerName: intent.customerName,
    customerEmail: intent.customerEmail,
    title: link.title,
    method: METHODS[String(intent.paymentMethod).toUpperCase()] ?? String(intent.paymentMethod).replace(/_/g, " "),
    gatewayPaymentId: intent.gatewayPaymentId,
    utr: intent.utr,
  };
}
