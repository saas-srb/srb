import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canViewCommercialFinance } from "@/lib/fms-roles";
import { getInvoiceByNumber } from "@/lib/products/cashflow-ai/invoices";
import { renderInvoicePdf } from "@/components/products/cashflow-ai/InvoicePdf";
import { recordPdf } from "@/lib/pdf/activity";

type Context = { params: Promise<{ invoiceNumber: string }> };

async function handleGET(_req: NextRequest, { params }: Context) {
  const user = await getCurrentFmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewCommercialFinance(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { invoiceNumber } = await params;
  const invoice = await getInvoiceByNumber(invoiceNumber);
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await renderInvoicePdf(invoice);

  await recordPdf({ type: "fms_invoice", ref: invoice.invoiceNumber, by: user.email, role: "staff" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withTransport(handleGET);
