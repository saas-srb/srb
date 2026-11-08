import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchRfqs, serializeRfq } from "@/lib/products/spendiq/rfqs";
import { isValidRfqStatus } from "@/lib/products/spendiq/constants";
import RfqsFilterBar from "./RfqsFilterBar";
import RfqsGrid, { type AdminRfqRow } from "./RfqsGrid";

export default async function AdminRfqsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.prms.rfqs");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidRfqStatus(sp.status) ? sp.status : undefined;
  const sortBy = sp.sortBy === "rfqCode" ? "rfqCode" : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchRfqs({
    page,
    pageSize: 20,
    search: sp.search,
    status,
    sortBy,
    sortDir,
  });

  const rows: AdminRfqRow[] = items.map(serializeRfq).map((r) => ({
    _id: r._id,
    rfqCode: r.rfqCode,
    title: r.title,
    departmentName: r.departmentName,
    status: r.status,
    vendorCount: r.vendorIds.length,
    quotationCount: r.quotations.length,
    createdAt: r.createdAt,
  }));

  const hasActiveFilters = Boolean(sp.search || status);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Procurement", panel: "prms" }, { label: "RFQs" }]}
        title={<>Requests for Quotation</>}
        description={<>{total} RFQ{total === 1 ? "" : "s"}.</>}
      />

      <RfqsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={<RfqsFilterBar initialSearch={sp.search ?? ""} initialStatus={status ?? ""} />}
      />
    </div>
  );
}
