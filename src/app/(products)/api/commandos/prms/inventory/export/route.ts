import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportInventoryItems } from "@/lib/products/spendiq/inventory";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.prms.inventory");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;
  const lowStock = sp.get("lowStock") === "1";

  const rows = await exportInventoryItems({ search: sp.get("search") ?? undefined, lowStock: lowStock || undefined, ids });

  const csv = toCsv(rows, [
    { header: "Item Code", value: (r) => r.itemCode },
    { header: "Name", value: (r) => r.name },
    { header: "Category", value: (r) => r.category ?? "" },
    { header: "Current Stock", value: (r) => String(r.currentStock) },
    { header: "Min Stock", value: (r) => String(r.minStock) },
    { header: "Unit Cost", value: (r) => String(r.unitCost) },
    { header: "Vendor", value: (r) => r.vendorName ?? "" },
    { header: "Location", value: (r) => r.location ?? "" },
  ]);

  const filename = `admin-prms-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
