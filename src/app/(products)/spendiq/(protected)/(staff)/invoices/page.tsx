import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, FileCheck2, Clock, AlertTriangle, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PrmsDataTable from "@/components/products/spendiq/PrmsDataTable";
import { billFormSections, vendorsWithPan } from "@/lib/products/cashflow-ai/tds/bill-sections";
import InvoiceForm from "@/components/products/spendiq/InvoiceForm";
import { InvoiceStatusBadge } from "@/components/products/spendiq/StatusBadges";
import { RenewalHint } from "@/components/products/spendiq/RenewalHint";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageFinance } from "@/lib/prms-roles";
import { searchInvoices, countInvoices, outstandingPayable, serializeInvoice } from "@/lib/products/spendiq/invoices";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { INVOICE_STATUSES, isValidInvoiceStatus, formatMoney, type InvoiceStatus } from "@/lib/products/spendiq/constants";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageFinance(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidInvoiceStatus(sp.status) ? (sp.status as InvoiceStatus) : undefined;
  const sortBy = sp.sortBy || "dueDate";
  const sortDir = sp.sortDir === "desc" ? "desc" : "asc";

  const [result, vendors, total, pending, overdue, payable, sections] = await Promise.all([
    searchInvoices({ search: sp.search, status, vendorId: sp.vendorId, page, pageSize: 20, sortBy, sortDir }),
    listVendorOptions({ activeOnly: true }),
    countInvoices(),
    countInvoices({ status: "pending" }),
    countInvoices({ status: "overdue" }),
    outstandingPayable(),
    canManage ? billFormSections() : Promise.resolve([]),
  ]);

  const withPan = canManage ? await vendorsWithPan(vendors.map((v) => v._id)) : new Set<string>();
  const vOpts = vendors.map((v) => ({ _id: v._id, companyName: v.companyName, hasPan: withPan.has(v._id) }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Invoices & Payments" }]}
        title={<>Invoices &amp; Payments</>}
        description={<>{total} invoice{total === 1 ? "" : "s"} in accounts payable.</>}
        actions={<>{canManage && (
          <InvoiceForm
            vendors={vOpts}
            tdsSections={sections}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Invoice
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Total Invoices" value={total} accent icon={<FileCheck2 className="size-4" />} />
        <KpiCard label="Pending" value={pending} tone={pending > 0 ? "down" : undefined} icon={<Clock className="size-4" />} />
        <KpiCard label="Overdue" value={overdue} tone={overdue > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
        <KpiCard label="Outstanding Payable" value={<span>{formatMoney(payable)}</span>} icon={<Coins className="size-4" />} />
      </KpiGrid>

      <PrmsDataTable
        columns={[
          { key: "code", header: "Invoice", sortable: true },
          { key: "vendor", header: "Vendor" },
          { key: "po", header: "PO" },
          { key: "net", header: "Net Payable", align: "right" },
          { key: "paid", header: "Paid", align: "right" },
          { key: "due", header: "Due" },
          { key: "status", header: "Status" },
        ]}
        rows={result.items.map(serializeInvoice).map((i) => ({
          id: i._id,
          href: `/spendiq/invoices/${i._id}`,
          cells: {
            code: i.invoiceNumber,
            vendor: i.vendorName,
            po: i.poNumber ?? "—",
            net: formatMoney(i.netPayable, i.currency),
            paid: formatMoney(i.amountPaid, i.currency),
            due: i.status === "paid" ? <span className="text-muted-foreground">Paid</span> : <RenewalHint date={i.dueDate} />,
            status: <InvoiceStatusBadge status={i.status} />,
          },
        }))}
        filters={[
          { key: "status", label: "Status", value: sp.status ?? "", options: INVOICE_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
          { key: "vendorId", label: "Vendor", value: sp.vendorId ?? "", options: vOpts.map((v) => ({ value: v._id, label: v.companyName })) },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Invoice #, vendor, PO #"
        sortBy={sortBy}
        sortDir={sortDir}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        exportBase="/api/spendiq/export/invoices"
        emptyLabel="No invoices match these filters."
      />
    </div>
  );
}
