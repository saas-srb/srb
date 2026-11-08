import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveRazorpayCredentials, type RazorpayCredentials } from "@/lib/platform/integrations/payments";

/**
 * Salary payout disbursement providers. `manual` (HR records the UTR after
 * paying through their own bank) is the default; `razorpay` (RazorpayX Payouts)
 * is a real integration, on the company's own RazorpayX account (Settings →
 * Payments & payouts), or — for the platform owner only — the env config.
 */

export interface BeneficiaryInput {
  contactName: string;
  contactEmail: string;
  contactReference: string; // employeeId
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  /** Pay to a UPI id instead of a bank account (then account number and IFSC are ignored). */
  upiId?: string | null;
  /** The contact's kind at RazorpayX: employee, vendor, customer, self. */
  contactType?: "employee" | "vendor" | "customer";
}

export interface CreatePayoutInput {
  payoutId: string; // our internal id — used as the idempotency key
  amountPaise: number;
  fundAccountId: string;
  referenceId: string; // e.g. "SAL-2026-09-YO-0001"
  narration: string;
  /** What the money is for (RazorpayX purpose): salary, vendor bill, refund, payout. Default salary. */
  purpose?: "salary" | "vendor bill" | "refund" | "payout";
  /** IMPS (default, up to ₹5 lakh), NEFT, RTGS (₹2 lakh or more) or UPI (for a UPI id). */
  mode?: "IMPS" | "NEFT" | "RTGS" | "UPI";
}

export interface FetchedPayout {
  amountPaise?: number;
  providerPayoutId: string;
  status: "queued" | "processing" | "paid" | "failed" | "reversed";
  utr?: string;
  failureReason?: string;
}

export interface WebhookResult {
  /** The amount RazorpayX says it paid, in paise: checked against what we asked for. */
  amountPaise?: number;
  providerPayoutId: string;
  status: "paid" | "failed" | "reversed";
  utr?: string;
  failureReason?: string;
}

export interface PayoutProvider {
  key: "manual" | "razorpay";
  /**
   * Which provider account this instance pays from (Razorpay key id), so
   * beneficiary ids cached on a bank account are only reused on the account
   * that created them. null for manual.
   */
  accountRef: string | null;
  /** Running on the platform owner's env credentials (the only account that existed before per-company accounts). */
  usesPlatformEnv: boolean;
  ensureBeneficiary(input: BeneficiaryInput): Promise<{ providerContactId: string; providerFundAccountId: string }>;
  createPayout(input: CreatePayoutInput): Promise<{ providerPayoutId: string; status: "processing" | "paid" }>;
  /** Asks RazorpayX where a payout stands: the answer when a webhook was missed. */
  fetchPayout(providerPayoutId: string): Promise<FetchedPayout>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  parseWebhook(json: unknown): WebhookResult | null;
}

// ---------------------------------------------------------------------------
// Manual
// ---------------------------------------------------------------------------

const manualProvider: PayoutProvider = {
  key: "manual",
  accountRef: null,
  usesPlatformEnv: false,
  async ensureBeneficiary() {
    return { providerContactId: "", providerFundAccountId: "" };
  },
  async createPayout() {
    throw new Error("MANUAL_PROVIDER");
  },
  async fetchPayout() {
    throw new Error("MANUAL_PROVIDER");
  },
  verifyWebhook() {
    return false;
  },
  parseWebhook() {
    return null;
  },
};

// ---------------------------------------------------------------------------
// RazorpayX Payouts — https://razorpay.com/docs/api/x/
// ---------------------------------------------------------------------------

const RZP_BASE = "https://api.razorpay.com/v1";

/** A RazorpayX provider bound to one set of credentials (the current company's). */
export function razorpayPayoutProvider(creds: RazorpayCredentials): PayoutProvider {
  const authHeader = `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}`;

  async function rzpFetch(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<Record<string, unknown>> {
    const { idempotencyKey, ...rest } = init;
    const res = await fetch(`${RZP_BASE}${path}`, {
      // A call that hangs must not hold a request open forever. A payout request that times out stays "queued" and is retried with the same
      // idempotency key, so it cannot pay twice.
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
      ...rest,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "X-Payout-Idempotency": idempotencyKey } : {}),
        ...(rest.headers ?? {}),
      },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const errObj = body.error as { description?: string } | undefined;
      throw new Error(`RazorpayX ${res.status}: ${errObj?.description ?? JSON.stringify(body)}`);
    }
    return body;
  }

  return {
    key: "razorpay",
    accountRef: creds.keyId,
    usesPlatformEnv: creds.source === "platform_env",

    async ensureBeneficiary(input) {
      const contact = await rzpFetch("/contacts", {
        method: "POST",
        body: JSON.stringify({
          name: input.contactName,
          email: input.contactEmail || undefined,
          type: input.contactType ?? "employee",
          reference_id: input.contactReference,
        }),
      });
      const contactId = String(contact.id);

      const fundAccount = await rzpFetch("/fund_accounts", {
        method: "POST",
        body: JSON.stringify(
          input.upiId
            ? { contact_id: contactId, account_type: "vpa", vpa: { address: input.upiId } }
            : {
                contact_id: contactId,
                account_type: "bank_account",
                bank_account: { name: input.accountHolderName, ifsc: input.ifsc, account_number: input.accountNumber },
              },
        ),
      });
      return { providerContactId: contactId, providerFundAccountId: String(fundAccount.id) };
    },

    async createPayout(input) {
      const sourceAccount = creds.accountNumber;
      if (!sourceAccount) {
        throw new Error(creds.source === "platform_env" ? "RAZORPAY_ACCOUNT_NUMBER is not set." : "No RazorpayX account number is connected.");
      }
      const body = await rzpFetch("/payouts", {
        method: "POST",
        idempotencyKey: input.payoutId,
        body: JSON.stringify({
          account_number: sourceAccount,
          fund_account_id: input.fundAccountId,
          amount: input.amountPaise,
          currency: "INR",
          mode: input.mode ?? "IMPS",
          purpose: input.purpose ?? "salary",
          queue_if_low_balance: true,
          reference_id: input.referenceId,
          narration: input.narration.slice(0, 30),
        }),
      });
      const status = String(body.status);
      return {
        providerPayoutId: String(body.id),
        status: status === "processed" ? "paid" : "processing",
      };
    },

    async fetchPayout(providerPayoutId) {
      const body = await rzpFetch(`/payouts/${encodeURIComponent(providerPayoutId)}`);
      const raw = String(body.status);
      const status: FetchedPayout["status"] = raw === "processed" ? "paid" : raw === "reversed" ? "reversed" : raw === "failed" || raw === "rejected" || raw === "cancelled" ? "failed" : raw === "queued" || raw === "pending" ? "queued" : "processing";
      const details = body.status_details as { description?: string } | undefined;
      return { providerPayoutId, status, amountPaise: typeof body.amount === "number" ? body.amount : undefined, utr: typeof body.utr === "string" ? body.utr : undefined, failureReason: status === "failed" || status === "reversed" ? details?.description ?? undefined : undefined };
    },

    verifyWebhook(rawBody, signature) {
      const secret = creds.webhookSecret;
      if (!secret || !signature) return false;
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      const a = Buffer.from(expected);
      const b = Buffer.from(signature);
      return a.length === b.length && timingSafeEqual(a, b);
    },

    parseWebhook(json) {
      const payload = json as {
        event?: string;
        payload?: { payout?: { entity?: { id?: string; utr?: string; amount?: number; status_details?: { description?: string } } } };
      };
      const payout = payload.payload?.payout?.entity;
      if (!payout?.id) return null;
      const map: Record<string, WebhookResult["status"]> = {
        "payout.processed": "paid",
        "payout.failed": "failed",
        "payout.reversed": "reversed",
        "payout.rejected": "failed",
      };
      const status = map[payload.event ?? ""];
      if (!status) return null;
      return {
        providerPayoutId: payout.id,
        amountPaise: typeof payout.amount === "number" ? payout.amount : undefined,
        status,
        utr: payout.utr,
        failureReason: payout.status_details?.description,
      };
    },
  };
}

/**
 * The current company's payout provider: RazorpayX on its own connected
 * account when payouts are enabled there; the platform owner (only) falls back
 * to the env config (`HRMS_PAYOUT_PROVIDER=razorpay` + RAZORPAY_* keys) when it
 * hasn't connected one. Everyone else gets the manual provider.
 */
export async function getPayoutProvider(): Promise<PayoutProvider> {
  const creds = await resolveRazorpayCredentials("payouts");
  return creds ? razorpayPayoutProvider(creds) : manualProvider;
}
