import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportClients } from "@/lib/products/sprintos/clients";
import { isValidClientStatus } from "@/lib/products/sprintos/constants";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.crm.clients");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search") ?? undefined;
  const status = sp.get("status");
  const industry = sp.get("industry") ?? undefined;
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportClients({
    search,
    status: status && isValidClientStatus(status) ? status : undefined,
    industry,
    ids,
  });

  const csv = toCsv(rows, [
    { header: "Client Code", value: (r) => r.clientCode },
    { header: "Company", value: (r) => r.companyName },
    { header: "Industry", value: (r) => r.industry ?? "" },
    { header: "Status", value: (r) => r.status },
    { header: "Contact Name", value: (r) => r.primaryContact.name },
    { header: "Contact Email", value: (r) => r.primaryContact.email ?? "" },
    { header: "Contact Phone", value: (r) => r.primaryContact.phone ?? "" },
    { header: "Website", value: (r) => r.website ?? "" },
    { header: "City", value: (r) => r.billing.city ?? "" },
    { header: "Country", value: (r) => r.billing.country ?? "" },
    { header: "Created At", value: (r) => new Date(r.createdAt).toISOString() },
  ]);

  const filename = `admin-crm-clients-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
