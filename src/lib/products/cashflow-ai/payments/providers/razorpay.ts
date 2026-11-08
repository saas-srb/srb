import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { paymentPublicBaseUrl } from "@/lib/products/cashflow-ai/payments/public-url";
import { NOT_CONNECTED_MESSAGE, resolveRazorpayCredentials } from "@/lib/platform/integrations/payments";
import {
  PaymentProvider,
  CreateProviderIntentParams,
  ProviderIntentResult,
  CreateProviderLinkParams,
  ProviderLinkResult,
  ProviderPaymentStatusResult,
  ProviderRefundParams,
  ProviderRefundResult,
  registerPaymentProvider,
} from "../provider";

/**
 * Razorpay payment gateway, on the CURRENT COMPANY's own Razorpay account
 * (Settings → Payments & payouts). The platform owner falls back to the
 * platform env credentials when it hasn't connected one; see
 * `resolveRazorpayCredentials`.
 */
async function authHeader(): Promise<string | null> {
  const creds = await resolveRazorpayCredentials("payments");
  if (!creds) return null;
  return `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}`;
}

export const RazorpayProvider: PaymentProvider = {
  id: "razorpay",
  name: "Razorpay Payment Gateway",

  async createPaymentIntent(params: CreateProviderIntentParams): Promise<ProviderIntentResult> {
    const auth = await authHeader();
    if (!auth) return { ok: false, error: NOT_CONNECTED_MESSAGE };

    try {
      const amountInPaisa = Math.round(params.amountInRupees * 100);

      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountInPaisa,
          currency: params.currency || "INR",
          receipt: params.paymentNumber,
          notes: {
            intentId: params.intentId,
            customerEmail: params.customerEmail,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error?.description || "Razorpay Order Creation Failed" };
      }

      return {
        ok: true,
        providerOrderId: data.id,
        rawPayload: data,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  },

  async createPaymentLink(params: CreateProviderLinkParams): Promise<ProviderLinkResult> {
    const auth = await authHeader();
    if (!auth) return { ok: false, error: NOT_CONNECTED_MESSAGE };

    try {
      const amountInPaisa = Math.round(params.amount * 100);

      const res = await fetch("https://api.razorpay.com/v1/payment_links", {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountInPaisa,
          currency: params.currency || "INR",
          accept_partial: false,
          description: params.description,
          customer: {
            name: params.customerName,
            email: params.customerEmail,
            contact: params.customerPhone,
          },
          notify: {
            sms: false,
            email: true,
          },
          reminder_enable: true,
          notes: {
            linkId: params.linkId,
            token: params.token,
          },
          callback_url: `${await paymentPublicBaseUrl()}/pay/${params.token}`,
          callback_method: "get",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error?.description || "Failed to create Razorpay Payment Link" };
      }

      return {
        ok: true,
        providerLinkId: data.id,
        shortUrl: data.short_url,
        rawPayload: data,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  },

  async getPaymentStatus(providerPaymentId: string): Promise<ProviderPaymentStatusResult> {
    const auth = await authHeader();
    if (!auth) return { ok: false, status: "FAILED", failureReason: NOT_CONNECTED_MESSAGE };

    try {
      const res = await fetch(`https://api.razorpay.com/v1/payments/${providerPaymentId}`, {
        headers: { Authorization: auth },
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, status: "FAILED", failureReason: data.error?.description };
      }

      const status = data.status === "captured" ? "SUCCESS" : data.status === "failed" ? "FAILED" : "PENDING";
      return {
        ok: true,
        status,
        providerPaymentId: data.id,
        providerOrderId: data.order_id,
        paymentMethod: data.method,
        utr: data.acquirer_data?.rrn || data.acquirer_data?.upi_transaction_id,
        rawPayload: data,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, status: "FAILED", failureReason: message };
    }
  },

  async refundPayment(params: ProviderRefundParams): Promise<ProviderRefundResult> {
    const auth = await authHeader();
    if (!auth) return { ok: false, status: "FAILED", error: NOT_CONNECTED_MESSAGE };

    try {
      const amountInPaisa = Math.round(params.refundAmount * 100);

      const res = await fetch(`https://api.razorpay.com/v1/payments/${params.providerPaymentId}/refund`, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountInPaisa,
          notes: { reason: params.reason || "Customer refund" },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { ok: false, status: "FAILED", error: data.error?.description || "Refund failed" };
      }

      return {
        ok: true,
        providerRefundId: data.id,
        status: "PROCESSED",
        rawPayload: data,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, status: "FAILED", error: message };
    }
  },

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;
    const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("hex"));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  },
};

registerPaymentProvider(RazorpayProvider);
