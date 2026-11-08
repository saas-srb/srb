import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { currentCompanyIdOrNull, isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getPlatformAccessForUser, hasPermission } from "@/lib/platform/console/roles";
import { getSaasInvoiceForViewer } from "@/lib/platform/billing/invoices";
import { renderSaasInvoicePdf } from "@/components/platform/billing/SaasInvoicePdf";
import { recordPdf } from "@/lib/pdf/activity";

type Context = { params: Promise<{ id: string }> };

/**
 * Downloads a SaaS tax invoice or credit note. A company's Directors get
 * only their own company's documents (anything else is a 404, never a 403, so
 * ids can't be probed); Platform Console users who may read invoices get any.
 */
async function handleGET(req: NextRequest, { params }: Context) {
  const user = await getCurrentHubUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.roles.includes("super_admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [{ id }, companyId, ownerContext] = await Promise.all([params, currentCompanyIdOrNull(), isPlatformOwnerContext()]);
  // "Any company's document" is a Platform Console right: the owner company AND a platform role that may read invoices.
  const platform = ownerContext ? await getPlatformAccessForUser(user.id) : null;
  const isPlatformAdmin = platform !== null && hasPermission(platform.permissions, "invoices.read");
  const invoice = await getSaasInvoiceForViewer(id, { companyId, isPlatformAdmin });
  if (!invoice?.number) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await renderSaasInvoicePdf(invoice);
  const filename = `${invoice.number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
  const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  await recordPdf({ type: "saas_invoice", variant: invoice.kind, ref: invoice.number, by: user.email, role: isPlatformAdmin && invoice.companyId !== companyId ? "platform" : "staff", companyId: invoice.companyId });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GET = withTransport(handleGET);
