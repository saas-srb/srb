import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchRequisitions } from "@/lib/products/spendiq/requisitions";
import { isValidRequisitionStatus } from "@/lib/products/spendiq/constants";
import RequisitionsFilterBar from "./RequisitionsFilterBar";
import RequisitionsGrid, { type AdminRequisitionRow } from "./RequisitionsGrid";

export default async function AdminRequisitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.prms.requisitions");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidRequisitionStatus(sp.status) ? sp.status : undefined;
  const sortBy =
    sp.sortBy === "prCode" || sp.sortBy === "estimatedCost" || sp.sortBy === "requiredDate" || sp.sortBy === "priority" || sp.sortBy === "status"
      ? sp.sortBy
      : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchRequisitions({
    page,
    pageSize: 20,
    search: sp.search,
    status,
    sortBy,
    sortDir,
  });

  const rows: AdminRequisitionRow[] = items.map((r) => ({
    _id: r._id,
    prCode: r.prCode,
    itemName: r.itemName,
    departmentName: r.departmentName,
    requesterName: r.requestedBy.name,
    status: r.status,
    priority: r.priority,
    estimatedCost: r.estimatedCost,
    currency: r.currency,
    requiredDate: r.requiredDate,
  }));

  const hasActiveFilters = Boolean(sp.search || sp.status);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Procurement", panel: "prms" }, { label: "Requisitions" }]}
        title={<>Purchase Requisitions</>}
        description={<>{total} requisition{total === 1 ? "" : "s"}. Approval decisions stay on the native review page — real
          multi-level approval logic isn&apos;t replicated here.</>}
      />

      <RequisitionsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={<RequisitionsFilterBar initialSearch={sp.search ?? ""} initialStatus={status ?? ""} />}
      />
    </div>
  );
}
