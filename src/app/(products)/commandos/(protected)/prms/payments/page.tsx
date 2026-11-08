import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchPayments, serializePayment } from "@/lib/products/spendiq/payments";
import PaymentsFilterBar from "./PaymentsFilterBar";
import PaymentsGrid, { type AdminPaymentRow } from "./PaymentsGrid";

const VALID_STATUSES = ["scheduled", "processed", "failed"] as const;

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.prms.payments");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = (VALID_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as (typeof VALID_STATUSES)[number])
    : undefined;
  const sortBy = sp.sortBy === "amount" ? "amount" : "paymentDate";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchPayments({
    page,
    pageSize: 20,
    search: sp.search,
    status,
    sortBy,
    sortDir,
  });

  const rows: AdminPaymentRow[] = items.map(serializePayment).map((p) => ({
    _id: p._id,
    paymentCode: p.paymentCode,
    invoiceNumber: p.invoiceNumber,
    vendorName: p.vendorName,
    amount: p.amount,
    method: p.method,
    status: p.status,
    paymentDate: p.paymentDate,
  }));

  const hasActiveFilters = Boolean(sp.search || status);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Finance", panel: "fms" }, { label: "Payments" }]}
        title={<>Vendor Payments</>}
        description={<>{total} payment{total === 1 ? "" : "s"}.</>}
      />

      <PaymentsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={<PaymentsFilterBar initialSearch={sp.search ?? ""} initialStatus={status ?? ""} />}
      />
    </div>
  );
}
