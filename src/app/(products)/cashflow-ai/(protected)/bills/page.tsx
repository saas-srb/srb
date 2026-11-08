import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Building2, Clock } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { InvoiceStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { listBills } from "@/lib/products/cashflow-ai/bills";
import { totalOutstandingPayable, overdueBills } from "@/lib/products/cashflow-ai/payables";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { INVOICE_STATUSES, isValidInvoiceStatus } from "@/lib/products/spendiq/constants";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate } from "@/lib/utils";

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidInvoiceStatus(sp.status) ? sp.status : undefined;

  const [result, vendors, payable, overdue] = await Promise.all([
    listBills({ search: sp.search, status, vendorId: sp.vendorId, page, pageSize: 20 }),
    listVendorOptions({ activeOnly: true }),
    totalOutstandingPayable(),
    overdueBills(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Bills" }]}
        title={<>Bills</>}
        description={<>Financial view over SpendIQ&apos;s vendor bills — {result.total} bill{result.total === 1 ? "" : "s"}.</>}
      />

      <KpiGrid>
        <KpiCard label="Total Payable" value={<span>{formatMoney(payable)}</span>} accent icon={<Building2 className="size-4" />} />
        <KpiCard label="Overdue Bills" value={overdue.count} tone={overdue.count > 0 ? "down" : undefined} icon={<Clock className="size-4" />} />
        <KpiCard label="Overdue Amount" value={<span>{formatMoney(overdue.amount)}</span>} icon={<Clock className="size-4" />} />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "number", header: "Bill" },
          { key: "vendor", header: "Vendor" },
          { key: "total", header: "Total", align: "right" },
          { key: "outstanding", header: "Outstanding", align: "right" },
          { key: "status", header: "Status" },
          { key: "due", header: "Due" },
        ]}
        rows={result.items.map((bill) => ({
          id: bill._id,
          href: `/cashflow-ai/bills/${bill._id}`,
          cells: {
            number: bill.invoiceNumber,
            vendor: bill.vendorName,
            total: formatMoney(bill.totalAmount, bill.currency),
            outstanding: formatMoney(bill.outstanding + bill.debitNoteTotal, bill.currency),
            status: <InvoiceStatusBadge status={bill.status} />,
            due: formatDate(bill.dueDate),
          },
        }))}
        filters={[
          { key: "status", label: "Status", value: sp.status ?? "", options: INVOICE_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
          { key: "vendorId", label: "Vendor", value: sp.vendorId ?? "", options: vendors.map((v) => ({ value: v._id, label: v.companyName })) },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Bill number, vendor invoice, PO"
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No vendor bills found — bills are created in SpendIQ."
      />
    </div>
  );
}
