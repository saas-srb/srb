import "server-only";

/** Razorpay is the only payment gateway. */
export type PaymentProviderId = "razorpay";

export interface CreateProviderIntentParams {
  intentId: string;
  paymentNumber: string;
  amount: number; // in minor units (e.g. paisa/cents) or standard decimals depending on provider
  amountInRupees: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  description: string;
  metadata?: Record<string, string>;
  returnUrl?: string;
}

export interface ProviderIntentResult {
  ok: boolean;
  providerPaymentId?: string;
  providerOrderId?: string;
  clientSecret?: string;
  checkoutUrl?: string;
  rawPayload?: Record<string, unknown>;
  error?: string;
}

export interface CreateProviderLinkParams {
  linkId: string;
  token: string;
  amount: number;
  currency: string;
  title: string;
  description: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  expiresAt?: Date;
}

export interface ProviderLinkResult {
  ok: boolean;
  providerLinkId?: string;
  shortUrl?: string;
  rawPayload?: Record<string, unknown>;
  error?: string;
}

export interface ProviderPaymentStatusResult {
  ok: boolean;
  status: "SUCCESS" | "PENDING" | "FAILED" | "CANCELLED" | "REFUNDED";
  providerPaymentId?: string;
  providerOrderId?: string;
  paymentMethod?: string;
  utr?: string;
  failureReason?: string;
  rawPayload?: Record<string, unknown>;
}

export interface ProviderRefundParams {
  paymentId: string;
  providerPaymentId: string;
  refundAmount: number; // in rupees
  reason?: string;
}

export interface ProviderRefundResult {
  ok: boolean;
  providerRefundId?: string;
  status: "PENDING" | "PROCESSED" | "FAILED";
  rawPayload?: Record<string, unknown>;
  error?: string;
}

export interface PaymentProvider {
  id: PaymentProviderId;
  name: string;
  createPaymentIntent(params: CreateProviderIntentParams): Promise<ProviderIntentResult>;
  createPaymentLink(params: CreateProviderLinkParams): Promise<ProviderLinkResult>;
  getPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentStatusResult>;
  refundPayment(params: ProviderRefundParams): Promise<ProviderRefundResult>;
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
}

const providersRegistry = new Map<PaymentProviderId, PaymentProvider>();

export function registerPaymentProvider(provider: PaymentProvider) {
  providersRegistry.set(provider.id, provider);
}

export function getPaymentProvider(id: PaymentProviderId = "razorpay"): PaymentProvider {
  const provider = providersRegistry.get(id);
  if (!provider) throw new Error(`Payment provider '${id}' is not available.`);
  return provider;
}
