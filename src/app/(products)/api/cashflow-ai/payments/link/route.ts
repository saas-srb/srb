import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { createPaymentLink, CreatePaymentLinkInput } from "@/lib/products/cashflow-ai/payments/links";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManagePaymentLinks } from "@/lib/fms-roles";
import { emailPaymentLink } from "@/lib/products/cashflow-ai/payments/link-email";
import { readSafeJson, UnsafeBodyError } from "@/lib/security/safe-json";

async function handlePOST(req: Request) {
  // Creating a payment link (and stamping a transaction) is a finance-staff action — never public.
  const staff = await getCurrentFmsUser();
  if (!staff) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canManagePaymentLinks(staff)) return NextResponse.json({ ok: false, error: "You don't have permission to create payment links." }, { status: 403 });
  try {
    let body: Record<string, unknown>;
    try {
      body = await readSafeJson(req);
    } catch (err) {
      if (err instanceof UnsafeBodyError) return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
      throw err;
    }
    const { sourceTransactionId: rawTransactionId, ...rest } = body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const sourceTransactionId = typeof rawTransactionId === "string" ? rawTransactionId : undefined;

    const input: CreatePaymentLinkInput = {
      title: rest.title,
      description: rest.description,
      amount: Number(rest.amount),
      currency: rest.currency || "INR",
      customerId: rest.customerId,
      customerName: rest.customerName || "Customer",
      customerEmail: rest.customerEmail,
      customerPhone: rest.customerPhone,
      sourceModule: rest.sourceModule || "DIRECT",
      sourceRecordId: rest.sourceRecordId,
      invoiceId: rest.invoiceId,
      expiresInDays: rest.expiresInDays ? Number(rest.expiresInDays) : 7,
    };

    if (!input.title || !input.amount || !input.customerEmail) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: title, amount, customerEmail" },
        { status: 400 }
      );
    }

    const res = await createPaymentLink(input);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.reason }, { status: 400 });
    }

    // Email the customer the link. The link only counts as "sent" if the email really went out.
    const mailed = res.publicUrl ? await emailPaymentLink({ to: input.customerEmail!, name: String(input.customerName), title: String(input.title), amount: input.amount, currency: input.currency || "INR", url: res.publicUrl }) : { sent: false, error: null };
    const emailSent = mailed.sent;
    const emailError = mailed.error;

    // ── Stamp the source transaction with the generated link URL ──
    if (sourceTransactionId && res.publicUrl) {
      const db = await getDb();
      const now = new Date();
      await db.collection("fms_transactions").updateOne(
        { _id: sourceTransactionId } as never,
        {
          $set: {
            paymentLink: res.publicUrl,
            paymentLinkToken: res.paymentLink?.token,
            ...(emailSent ? { paymentLinkSentAt: now, status: "link_sent" } : { paymentLinkCreatedAt: now }),
            updatedAt: now,
          },
        }
      );
    }

    return NextResponse.json({
      ok: true,
      paymentLink: res.paymentLink,
      publicUrl: res.publicUrl,
      emailSent,
      emailError,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const POST = withTransport(handlePOST);
