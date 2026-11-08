import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement, canManageFinance } from "@/lib/prms-roles";
import { getPurchaseOrderByNumber } from "@/lib/products/spendiq/purchase-orders";
import { getPrmsSettings } from "@/lib/products/spendiq/settings";
import { renderPurchaseOrderPdf } from "@/components/products/spendiq/PurchaseOrderPdf";
import { recordPdf } from "@/lib/pdf/activity";

type Context = { params: Promise<{ poNumber: string }> };

async function handleGET(_req: NextRequest, { params }: Context) {
  const user = await getCurrentPrmsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageProcurement(user) && !canManageFinance(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { poNumber } = await params;
  const po = await getPurchaseOrderByNumber(poNumber);
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await getPrmsSettings();
  const buffer = await renderPurchaseOrderPdf(po, settings.company);

  await recordPdf({ type: "prms_po", ref: po.poNumber, by: user.email, role: "staff" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${po.poNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const GET = withTransport(handleGET);
