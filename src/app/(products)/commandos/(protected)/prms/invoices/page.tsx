import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchInvoices, serializeInvoice } from "@/lib/products/spendiq/invoices";
import { isValidInvoiceStatus } from "@/lib/products/spendiq/constants";
import InvoicesFilterBar from "./InvoicesFilterBar";
import InvoicesGrid, { type AdminInvoiceRow } from "./InvoicesGrid";

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.prms.invoices");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidInvoiceStatus(sp.status) ? sp.status : undefined;
  const sortBy = sp.sortBy === "invoiceNumber" || sp.sortBy === "netPayable" ? sp.sortBy : "dueDate";
  const sortDir = sp.sortDir === "desc" ? "desc" : "asc";

  const { items, total, totalPages } = await searchInvoices({
    page,
    pageSize: 20,
    search: sp.search,
    status,
    sortBy,
    sortDir,
  });

  const rows: AdminInvoiceRow[] = items.map(serializeInvoice).map((i) => ({
    _id: i._id,
    invoiceNumber: i.invoiceNumber,
    vendorName: i.vendorName,
    poNumber: i.poNumber,
    status: i.status,
    netPayable: i.netPayable,
    amountPaid: i.amountPaid,
    currency: i.currency,
    dueDate: i.dueDate,
    poMatched: i.poMatched,
    grnMatched: i.grnMatched,
  }));

  const hasActiveFilters = Boolean(sp.search || status);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Finance", panel: "fms" }, { label: "Vendor Invoices" }]}
        title={<>Vendor Invoices</>}
        description={<>{total} invoice{total === 1 ? "" : "s"}.</>}
      />

      <InvoicesGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={<InvoicesFilterBar initialSearch={sp.search ?? ""} initialStatus={status ?? ""} />}
      />
    </div>
  );
}
