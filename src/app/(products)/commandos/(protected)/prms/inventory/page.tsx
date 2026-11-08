import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchInventoryItems } from "@/lib/products/spendiq/inventory";
import InventoryFilterBar from "./InventoryFilterBar";
import InventoryGrid, { type AdminInventoryRow } from "./InventoryGrid";

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; lowStock?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.prms.inventory");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const lowStock = sp.lowStock === "1";
  const sortBy = sp.sortBy === "unitCost" ? "unitCost" : "name";
  const sortDir = sp.sortDir === "desc" ? "desc" : "asc";

  const { items, total, totalPages } = await searchInventoryItems({
    page,
    pageSize: 20,
    search: sp.search,
    lowStock: lowStock || undefined,
    sortBy,
    sortDir,
  });

  const rows: AdminInventoryRow[] = items.map((i) => ({
    _id: i._id,
    itemCode: i.itemCode,
    name: i.name,
    category: i.category,
    currentStock: i.currentStock,
    minStock: i.minStock,
    unitCost: i.unitCost,
  }));

  const hasActiveFilters = Boolean(sp.search || lowStock);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Procurement", panel: "prms" }, { label: "Inventory" }]}
        title={<>Inventory</>}
        description={<>{total} item{total === 1 ? "" : "s"}.</>}
      />

      <InventoryGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={<InventoryFilterBar initialSearch={sp.search ?? ""} initialLowStock={lowStock} />}
      />
    </div>
  );
}
