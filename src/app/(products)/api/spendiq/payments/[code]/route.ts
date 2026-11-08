import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageFinance } from "@/lib/prms-roles";
import { getInvoice } from "@/lib/products/spendiq/invoices";
import { getPrmsSettings } from "@/lib/products/spendiq/settings";
import { renderPaymentReceiptPdf } from "@/components/products/spendiq/PaymentReceiptPdf";
import type { Payment } from "@/lib/products/spendiq/payments";
import { recordPdf } from "@/lib/pdf/activity";

type Context = { params: Promise<{ code: string }> };

async function handleGET(_req: NextRequest, { params }: Context) {
  const user = await getCurrentPrmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageFinance(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { code } = await params;
  const db = await getDb();
  const payment = await db.collection<Payment>("prms_payments").findOne({ paymentCode: code, deletedAt: null });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const invoice = await getInvoice(payment.invoiceId);
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const settings = await getPrmsSettings();
  const buffer = await renderPaymentReceiptPdf(payment, invoice, settings.company);

  await recordPdf({ type: "prms_payment", ref: payment.paymentCode, by: user.email, role: "staff" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${payment.paymentCode}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withTransport(handleGET);
