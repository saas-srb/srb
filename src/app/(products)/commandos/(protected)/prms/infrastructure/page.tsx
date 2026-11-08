import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchInfrastructure } from "@/lib/products/spendiq/infrastructure";
import { isValidResourceStatus } from "@/lib/products/spendiq/constants";
import InfrastructureFilterBar from "./InfrastructureFilterBar";
import InfrastructureGrid, { type AdminInfrastructureRow } from "./InfrastructureGrid";

export default async function AdminInfrastructurePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.prms.infrastructure");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidResourceStatus(sp.status) ? sp.status : undefined;
  const sortBy = sp.sortBy === "name" || sp.sortBy === "monthlyCost" ? sp.sortBy : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchInfrastructure({
    page,
    pageSize: 20,
    search: sp.search,
    filters: { status },
    sortBy,
    sortDir,
  });

  const rows: AdminInfrastructureRow[] = items.map((r) => ({
    _id: r._id,
    name: r.name,
    provider: r.provider,
    resourceType: r.resourceType,
    monthlyCost: r.monthlyCost,
    currency: r.currency,
    renewalDate: r.renewalDate,
    autoRenew: r.autoRenew,
    status: r.status,
  }));

  const hasActiveFilters = Boolean(sp.search || status);

  const exportParams = new URLSearchParams();
  if (sp.search) exportParams.set("search", sp.search);
  if (status) exportParams.set("status", status);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Procurement", panel: "prms" }, { label: "Infrastructure" }]}
        title={<>Infrastructure</>}
        description={<>{total} resource{total === 1 ? "" : "s"}.</>}
      />

      <InfrastructureGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        exportHref={`/api/commandos/prms/infrastructure/export?${exportParams.toString()}`}
        filters={<InfrastructureFilterBar initialSearch={sp.search ?? ""} initialStatus={status ?? ""} />}
      />
    </div>
  );
}
