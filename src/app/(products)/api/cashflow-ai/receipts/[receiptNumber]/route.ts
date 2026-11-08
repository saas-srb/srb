import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canViewCommercialFinance } from "@/lib/fms-roles";
import { getReceiptByNumber } from "@/lib/products/cashflow-ai/receipts";
import { renderReceiptPdf } from "@/components/products/cashflow-ai/ReceiptPdf";
import { recordPdf } from "@/lib/pdf/activity";

type Context = { params: Promise<{ receiptNumber: string }> };

async function handleGET(_req: NextRequest, { params }: Context) {
  const user = await getCurrentFmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewCommercialFinance(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { receiptNumber } = await params;
  const receipt = await getReceiptByNumber(receiptNumber);
  if (!receipt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await renderReceiptPdf(receipt);

  await recordPdf({ type: "fms_receipt", ref: receipt.receiptNumber, by: user.email, role: "staff" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${receipt.receiptNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withTransport(handleGET);
