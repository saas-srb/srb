import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchPaymentPlans } from "@/lib/products/cohort-ai/payments";
import PaymentsFilterBar from "./PaymentsFilterBar";
import PaymentsGrid, { type AdminPaymentRow } from "./PaymentsGrid";

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.tms.payments");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const sortBy = sp.sortBy === "totalFees" ? "totalFees" : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchPaymentPlans({
    page,
    pageSize: 20,
    search: sp.search,
    sortBy,
    sortDir,
  });

  const rows: AdminPaymentRow[] = items.map((p) => ({
    _id: p._id,
    studentName: p.studentName,
    programName: p.programName,
    totalFees: p.totalFees,
    paidAmount: p.paidAmount,
    pendingAmount: p.pendingAmount,
    status: p.status,
    currency: p.currency,
  }));

  const hasActiveFilters = Boolean(sp.search);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Cohort AI", panel: "tms" }, { label: "Payments" }]}
        title={<>Payments</>}
        description={<>{total} payment plan{total === 1 ? "" : "s"}.</>}
      />

      <PaymentsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={<PaymentsFilterBar initialSearch={sp.search ?? ""} />}
      />
    </div>
  );
}
