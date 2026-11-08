import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { limitOr429 } from "@/lib/security/rate-limit";
import { createPaymentIntent, CreatePaymentIntentData } from "@/lib/products/cashflow-ai/payments/intents";
import { acquireIdempotencyLock, releaseIdempotencyLock } from "@/lib/products/cashflow-ai/payments/idempotency";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canApproveTransactions, canManageTransactions } from "@/lib/fms-roles";
import { claimLinkAttempt, getPaymentLinkByToken } from "@/lib/products/cashflow-ai/payments/links";
import { resolveRazorpayCredentials } from "@/lib/platform/integrations/payments";
import { readSafeJson, UnsafeBodyError } from "@/lib/security/safe-json";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Creates a payment intent. Two callers only:
 *  - signed-in FMS staff (any detail they choose, as before, with types enforced), or
 *  - a payer on a public payment link — identified by the link's secret TOKEN. For them everything that matters
 *    (amount, currency, invoice, customer) is read from the stored link, never from the request, discounts and wallet
 *    credits are not accepted, and a simulated gateway is refused outside development.
 */
async function handlePOST(req: Request) {
  const limited = await limitOr429(req, "pay-intent", 20, 600);
  if (limited) return limited;
  try {
    let body: Record<string, unknown>;
    try {
      body = await readSafeJson(req);
    } catch (err) {
      if (err instanceof UnsafeBodyError) return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
      throw err;
    }
    const staff = await getCurrentFmsUser();
    const idempotencyKey = str(req.headers.get("x-idempotency-key") || body.idempotencyKey, 120) || undefined;

    let input: CreatePaymentIntentData;
    // Someone paying through a link (even while signed in as staff) is a payer: amount and customer come from the stored link.
    if (staff && !str(body.linkToken, 64)) {
      // Any amount, discount or wallet credit the caller names is accepted on this path, so it is for the people who run payments, not for
      // every finance login (a read-only or audit role can open the product but must not start a payment). Discounts and wallet credits
      // change what a customer owes: those need the approver's right on top.
      if (!canManageTransactions(staff)) return NextResponse.json({ ok: false, error: "You don't have permission to create payments." }, { status: 403 });
      if ((Number(body.walletCreditsUsed) > 0 || Number(body.offerDiscountAmount) > 0) && !canApproveTransactions(staff)) {
        return NextResponse.json({ ok: false, error: "Applying a discount or wallet credit needs approval rights." }, { status: 403 });
      }
      input = {
        sourceModule: body.sourceModule as CreatePaymentIntentData["sourceModule"],
        sourceType: str(body.sourceType),
        sourceId: str(body.sourceId),
        customerId: body.customerId ? str(body.customerId) : undefined,
        customerName: str(body.customerName) || "Customer",
        customerEmail: str(body.customerEmail, 200),
        customerPhone: body.customerPhone ? str(body.customerPhone, 40) : undefined,
        invoiceId: body.invoiceId ? str(body.invoiceId) : undefined,
        amount: Number(body.amount),
        walletCreditsUsed: body.walletCreditsUsed ? Number(body.walletCreditsUsed) : 0,
        offerDiscountAmount: body.offerDiscountAmount ? Number(body.offerDiscountAmount) : 0,
        currency: str(body.currency, 8) || "INR",
        paymentMethod: (str(body.paymentMethod, 20) || "UPI") as CreatePaymentIntentData["paymentMethod"],
        paymentProvider: "razorpay",
        idempotencyKey,
        metadata: body.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, unknown>) : undefined,
      };
    } else {
      const link = await getPaymentLinkByToken(str(body.linkToken, 64));
      if (!link || link.status === "PAID" || link.status === "EXPIRED" || link.status === "CANCELLED" || link.status === "DRAFT") {
        return NextResponse.json({ ok: false, error: "This payment link isn't available." }, { status: 403 });
      }
      // Counted atomically: a link allows only so many attempts, and a paid or expired one allows none.
      if (!(await claimLinkAttempt(link._id))) {
        return NextResponse.json({ ok: false, error: "This payment link can't be used any more (it was paid, has expired or has had too many attempts). Ask for a new one." }, { status: 403 });
      }
      input = {
        sourceModule: link.sourceModule,
        sourceType: "DIRECT_LINK",
        sourceId: link._id,
        customerId: link.customerId ?? undefined,
        customerName: link.customerName,
        customerEmail: link.customerEmail,
        customerPhone: link.customerPhone ?? undefined,
        invoiceId: link.invoiceId ?? undefined,
        amount: link.amount,
        walletCreditsUsed: 0,
        offerDiscountAmount: 0,
        currency: link.currency,
        paymentMethod: "UPI",
        paymentProvider: "razorpay",
        idempotencyKey,
      };
    }

    if (idempotencyKey) {
      const lock = await acquireIdempotencyLock(idempotencyKey, "create_payment_intent");
      if (!lock.acquired && lock.cachedResponse) {
        return NextResponse.json(lock.cachedResponse);
      }
    }

    if (!input.sourceModule || !input.sourceType || !input.sourceId || !Number.isFinite(input.amount) || input.amount <= 0) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: sourceModule, sourceType, sourceId, amount" },
        { status: 400 }
      );
    }

    const res = await createPaymentIntent(input);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.reason }, { status: 400 });
    }

    // The browser needs the key id (public by design) to open Razorpay Checkout for the order.
    const creds = res.intent.paymentProvider === "razorpay" ? await resolveRazorpayCredentials("payments") : null;
    const responseData = {
      ok: true,
      keyId: creds?.keyId ?? null,
      amountPaise: Math.round(res.intent.netAmount * 100),
      currency: res.intent.currency,
      paymentIntent: res.intent,
      checkoutUrl: res.intent.checkoutUrl,
      clientSecret: res.intent.paymentSessionId,
      gatewayOrderId: res.intent.gatewayOrderId,
    };

    if (idempotencyKey) {
      await releaseIdempotencyLock(idempotencyKey, responseData);
    }

    return NextResponse.json(responseData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
