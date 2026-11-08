import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchPurchaseOrders } from "@/lib/products/spendiq/purchase-orders";
import { isValidPoStatus } from "@/lib/products/spendiq/constants";
import PurchaseOrdersFilterBar from "./PurchaseOrdersFilterBar";
import PurchaseOrdersGrid, { type AdminPoRow } from "./PurchaseOrdersGrid";

export default async function AdminPurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.prms.purchase-orders");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidPoStatus(sp.status) ? sp.status : undefined;
  const sortBy = sp.sortBy === "poNumber" || sp.sortBy === "totalAmount" || sp.sortBy === "status" ? sp.sortBy : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchPurchaseOrders({
    page,
    pageSize: 20,
    search: sp.search,
    status,
    sortBy,
    sortDir,
  });

  const rows: AdminPoRow[] = items.map((p) => ({
    _id: p._id,
    poNumber: p.poNumber,
    vendorName: p.vendorName,
    status: p.status,
    totalAmount: p.totalAmount,
    currency: p.currency,
    deliveryDate: p.deliveryDate,
  }));

  const hasActiveFilters = Boolean(sp.search || sp.status);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Procurement", panel: "prms" }, { label: "Purchase Orders" }]}
        title={<>Purchase Orders</>}
        description={<>{total} purchase order{total === 1 ? "" : "s"}.</>}
      />

      <PurchaseOrdersGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={<PurchaseOrdersFilterBar initialSearch={sp.search ?? ""} initialStatus={status ?? ""} />}
      />
    </div>
  );
}
