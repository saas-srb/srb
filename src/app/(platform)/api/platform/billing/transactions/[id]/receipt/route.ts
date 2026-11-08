import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { currentCompanyIdOrNull, isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getPlatformAccessForUser, hasPermission } from "@/lib/platform/console/roles";
import { getTransactionForViewer } from "@/lib/platform/billing/transactions";
import { renderTransactionReceiptPdf } from "@/components/platform/billing/TransactionReceiptPdf";
import { recordPdf } from "@/lib/pdf/activity";

type Context = { params: Promise<{ id: string }> };

/**
 * Downloads the receipt of one subscription payment or refund. A company's Directors get only their own (anything else is a 404, never a
 * 403, so ids can't be probed); Platform Console users who may read invoices get any.
 */
async function handleGET(req: NextRequest, { params }: Context) {
  const user = await getCurrentHubUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.roles.includes("super_admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [{ id }, companyId, ownerContext] = await Promise.all([params, currentCompanyIdOrNull(), isPlatformOwnerContext()]);
  const platform = ownerContext ? await getPlatformAccessForUser(user.id) : null;
  const isPlatformAdmin = platform !== null && hasPermission(platform.permissions, "invoices.read");
  const tx = await getTransactionForViewer(id, { companyId, isPlatformAdmin });
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await renderTransactionReceiptPdf(tx);
  const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  if (!isPlatformAdmin) await recordPdf({ type: "transaction_receipt", ref: tx.receiptNumber, by: user.email, role: "staff" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${tx.receiptNumber}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GET = withTransport(handleGET);
