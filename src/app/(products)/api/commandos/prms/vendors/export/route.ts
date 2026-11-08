import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportVendors } from "@/lib/products/spendiq/vendors";
import { isValidVendorStatus, isValidVendorCategory, getVendorCategoryLabel } from "@/lib/products/spendiq/constants";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.prms.vendors");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search") ?? undefined;
  const status = sp.get("status");
  const category = sp.get("category");
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportVendors({
    search,
    status: status && isValidVendorStatus(status) ? status : undefined,
    category: category && isValidVendorCategory(category) ? category : undefined,
    ids,
  });

  const csv = toCsv(rows, [
    { header: "Vendor Code", value: (r) => r.vendorCode },
    { header: "Company", value: (r) => r.companyName },
    { header: "Category", value: (r) => getVendorCategoryLabel(r.category) },
    { header: "Status", value: (r) => r.status },
    { header: "Contact Person", value: (r) => r.contactPerson ?? "" },
    { header: "Email", value: (r) => r.email ?? "" },
    { header: "Phone", value: (r) => r.phone ?? "" },
    { header: "GSTIN", value: (r) => r.gstin ?? "" },
    { header: "Rating", value: (r) => (r.rating != null ? String(r.rating) : "") },
    { header: "Created At", value: (r) => new Date(r.createdAt).toISOString() },
  ]);

  const filename = `admin-prms-vendors-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
