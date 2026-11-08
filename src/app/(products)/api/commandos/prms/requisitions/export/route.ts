import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportRequisitions } from "@/lib/products/spendiq/requisitions";
import { getRequisitionStatusMeta, isValidRequisitionStatus } from "@/lib/products/spendiq/constants";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.prms.requisitions");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportRequisitions({
    search: sp.get("search") ?? undefined,
    status: status && isValidRequisitionStatus(status) ? status : undefined,
    ids,
  });

  const csv = toCsv(rows, [
    { header: "PR Code", value: (r) => r.prCode },
    { header: "Item", value: (r) => r.itemName },
    { header: "Department", value: (r) => r.departmentName ?? "" },
    { header: "Project", value: (r) => r.projectName ?? "" },
    { header: "Requested By", value: (r) => r.requestedBy.name },
    { header: "Status", value: (r) => getRequisitionStatusMeta(r.status).label },
    { header: "Priority", value: (r) => r.priority },
    { header: "Quantity", value: (r) => String(r.quantity) },
    { header: "Estimated Cost", value: (r) => String(r.estimatedCost) },
    { header: "Currency", value: (r) => r.currency },
    { header: "Required Date", value: (r) => r.requiredDate ?? "" },
    { header: "Created At", value: (r) => new Date(r.createdAt).toISOString() },
  ]);

  const filename = `admin-prms-requisitions-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
