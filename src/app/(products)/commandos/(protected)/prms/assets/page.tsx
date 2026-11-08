import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchAssets } from "@/lib/products/spendiq/assets";
import { isValidAssetStatus } from "@/lib/products/spendiq/constants";
import AssetsFilterBar from "./AssetsFilterBar";
import AssetsGrid, { type AdminAssetRow } from "./AssetsGrid";

export default async function AdminAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.prms.assets");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidAssetStatus(sp.status) ? sp.status : undefined;
  const sortBy = sp.sortBy === "currentValue" || sp.sortBy === "name" ? sp.sortBy : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchAssets({
    page,
    pageSize: 20,
    search: sp.search,
    status,
    sortBy,
    sortDir,
  });

  const rows: AdminAssetRow[] = items.map((a) => ({
    _id: a._id,
    assetCode: a.assetCode,
    name: a.name,
    category: a.category,
    status: a.status,
    assignedEmployeeName: a.assignedEmployeeName,
    currentValue: a.currentValue,
    currency: a.currency,
  }));

  const hasActiveFilters = Boolean(sp.search || sp.status);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Procurement", panel: "prms" }, { label: "Assets" }]}
        title={<>Assets</>}
        description={<>{total} asset{total === 1 ? "" : "s"}.</>}
      />

      <AssetsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={<AssetsFilterBar initialSearch={sp.search ?? ""} initialStatus={status ?? ""} />}
      />
    </div>
  );
}
