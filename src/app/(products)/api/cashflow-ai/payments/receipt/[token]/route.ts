import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { limitOr429 } from "@/lib/security/rate-limit";
import { receiptForLinkToken } from "@/lib/products/cashflow-ai/payments/public-receipt";
import { recordPdf } from "@/lib/pdf/activity";
import { renderPublicReceiptPdf } from "@/components/products/cashflow-ai/PaymentReceiptPdf";

type Context = { params: Promise<{ token: string }> };

/**
 * The customer's receipt as a PDF. No sign-in: the payment link's secret token is the key, and it only answers once that link has been paid.
 * `?download=1` makes the browser save the file instead of showing it.
 */
async function handleGET(req: NextRequest, { params }: Context) {
  const limited = await limitOr429(req, "pay-receipt", 30, 600);
  if (limited) return limited;
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const receipt = await receiptForLinkToken(token);
  if (!receipt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buffer = await renderPublicReceiptPdf(receipt);
  await recordPdf({ type: "fms_payment_receipt", ref: receipt.number, by: receipt.customerEmail || "customer", role: "client" });
  const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="Receipt-${receipt.number.replace(/[^A-Za-z0-9_-]/g, "")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withTransport(handleGET);
