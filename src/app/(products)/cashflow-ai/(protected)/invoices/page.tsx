import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, FileText, Clock, AlertTriangle, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import InvoiceForm from "@/components/products/cashflow-ai/InvoiceForm";
import { InvoiceStatusBadge } from "@/components/products/cashflow-ai/StatusBadges";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { searchInvoices, serializeInvoice, invoiceBalance, countInvoices } from "@/lib/products/cashflow-ai/invoices";
import { totalOutstandingInvoices, overdueInvoices } from "@/lib/products/cashflow-ai/receivables";
import { listClientOptions } from "@/lib/products/sprintos/clients";
import { listProjectOptions } from "@/lib/products/cashflow-ai/pickers";
import { INVOICE_STATUSES, isValidInvoiceStatus, formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate } from "@/lib/utils";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentFmsUser();
  const canManage = user ? canManageTransactions(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidInvoiceStatus(sp.status) ? sp.status : undefined;
  const sortBy = (sp.sortBy as "dueDate" | "invoiceDate" | "createdAt" | "totalAmount" | "invoiceNumber") || "dueDate";
  const sortDir = sp.sortDir === "desc" ? "desc" : "asc";

  const [result, customers, projects, total, outstanding, overdue] = await Promise.all([
    searchInvoices({ search: sp.search, status, page, pageSize: 20, sortBy, sortDir }),
    listClientOptions(),
    listProjectOptions(),
    countInvoices(),
    totalOutstandingInvoices(),
    overdueInvoices(),
  ]);

  const customerOpts = customers.map((c) => ({ _id: c._id, label: `${c.companyName} (${c.clientCode})` }));
  const projectOpts = projects.map((p) => ({ _id: p._id, label: p.name }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Invoices" }]}
        title={<>Invoices</>}
        description={<>{total} invoice{total === 1 ? "" : "s"} raised.</>}
        actions={<>{canManage && (
          <InvoiceForm
            customers={customerOpts}
            projects={projectOpts}
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
        <KpiCard label="Total Invoices" value={total} accent icon={<FileText className="size-4" />} />
        <KpiCard label="Outstanding" value={<span>{formatMoney(outstanding.amount)}</span>} icon={<Clock className="size-4" />} />
        <KpiCard label="Overdue" value={overdue.count} tone={overdue.count > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
        <KpiCard label="Overdue Amount" value={<span>{formatMoney(overdue.amount)}</span>} icon={<Coins className="size-4" />} />
      </KpiGrid>

      <FmsDataTable
        columns={[
          { key: "number", header: "Invoice", sortable: true },
          { key: "customer", header: "Customer" },
          { key: "total", header: "Total", sortable: true, align: "right" },
          { key: "balance", header: "Balance", align: "right" },
          { key: "status", header: "Status" },
          { key: "due", header: "Due", sortable: true },
        ]}
        rows={result.items.map(serializeInvoice).map((inv) => ({
          id: inv._id,
          href: `/cashflow-ai/invoices/${inv._id}`,
          cells: {
            number: inv.invoiceNumber,
            customer: inv.customerName,
            total: formatMoney(inv.totalAmount, inv.currency),
            balance: formatMoney(invoiceBalance(inv), inv.currency),
            status: <InvoiceStatusBadge status={inv.status} />,
            due: formatDate(inv.dueDate),
          },
        }))}
        filters={[
          { key: "status", label: "Status", value: sp.status ?? "", options: INVOICE_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Invoice number, customer, PO"
        sortBy={sortBy}
        sortDir={sortDir}
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        emptyLabel="No invoices match these filters."
      />
    </div>
  );
}
