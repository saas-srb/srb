import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedPmsRequest } from "@/lib/products/sprintos/api-auth";
import { exportClients } from "@/lib/products/sprintos/clients";
import { getClientStatusMeta, isValidClientStatus, type ClientStatus } from "@/lib/products/sprintos/constants";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  if (!(await isAuthorizedPmsRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const idsParam = sp.get("ids");

  const rows = await exportClients({
    search: sp.get("search") ?? undefined,
    status: status && isValidClientStatus(status) ? (status as ClientStatus) : undefined,
    industry: sp.get("industry") ?? undefined,
    ids: idsParam ? idsParam.split(",").filter(Boolean) : undefined,
  });

  const csv = toCsv(rows, [
    { header: "Client Code", value: (r) => r.clientCode },
    { header: "Company", value: (r) => r.companyName },
    { header: "Status", value: (r) => getClientStatusMeta(r.status).label },
    { header: "Industry", value: (r) => r.industry ?? "" },
    { header: "Website", value: (r) => r.website ?? "" },
    { header: "Contact Name", value: (r) => r.primaryContact.name },
    { header: "Contact Email", value: (r) => r.primaryContact.email ?? "" },
    { header: "Contact Phone", value: (r) => r.primaryContact.phone ?? "" },
    { header: "Contact Designation", value: (r) => r.primaryContact.designation ?? "" },
    { header: "Billing City", value: (r) => r.billing.city ?? "" },
    { header: "Billing Country", value: (r) => r.billing.country ?? "" },
    { header: "GSTIN", value: (r) => r.billing.gstin ?? "" },
    { header: "Currency", value: (r) => r.billing.currency },
    { header: "Payment Terms (days)", value: (r) => (r.billing.paymentTermsDays != null ? String(r.billing.paymentTermsDays) : "") },
    { header: "Tags", value: (r) => r.tags.join("; ") },
    { header: "Created At", value: (r) => new Date(r.createdAt).toISOString() },
  ]);

  const filename = `pms-clients-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
