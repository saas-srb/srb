import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportRfqs } from "@/lib/products/spendiq/rfqs";
import { getRfqStatusMeta, isValidRfqStatus } from "@/lib/products/spendiq/constants";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.prms.rfqs");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportRfqs({
    search: sp.get("search") ?? undefined,
    status: status && isValidRfqStatus(status) ? status : undefined,
    ids,
  });

  const csv = toCsv(rows, [
    { header: "RFQ Code", value: (r) => r.rfqCode },
    { header: "Title", value: (r) => r.title },
    { header: "Department", value: (r) => r.departmentName ?? "" },
    { header: "Status", value: (r) => getRfqStatusMeta(r.status).label },
    { header: "Vendors Invited", value: (r) => String(r.vendorIds.length) },
    { header: "Quotes Received", value: (r) => String(r.quotations.length) },
    { header: "Awarded Vendor", value: (r) => r.awardedVendorId ?? "" },
    { header: "Created", value: (r) => new Date(r.createdAt).toISOString() },
  ]);

  const filename = `admin-prms-rfqs-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
