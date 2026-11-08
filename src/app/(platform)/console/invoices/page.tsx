import type { Metadata } from "next";
import { CircleAlert, FileDown, IndianRupee, Landmark, ReceiptText, Undo2 } from "lucide-react";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { formatInvoiceDate, listInvoiceFinancialYears, listInvoicedCompanies, listSaasInvoices, type SaasInvoiceRow } from "@/lib/platform/billing/invoices";
import { formatMoney } from "@/lib/platform/billing/types";
import InvoicesFilterBar from "./InvoicesFilterBar";
import InvoicesGrid, { type PanelInvoiceRow } from "./InvoicesGrid";
import { filterQueryString, parseInvoiceFilters } from "./filters";

export const metadata: Metadata = { title: "SaaS invoices" };

const PAGE_SIZE = 50;

function toRow(inv: SaasInvoiceRow): PanelInvoiceRow {
  const m = (n: number) => formatMoney(n, inv.currency);
  const creditedTotal = inv.credited?.total ?? 0;
  return {
    id: inv._id,
    number: inv.number ?? "",
    kind: inv.kind === "credit_note" ? "credit_note" : "invoice",
    status: inv.status,
    credited: inv.kind === "credit_note" || !creditedTotal ? null : creditedTotal >= inv.total ? "full" : "partial",
    companyId: inv.companyId,
    companyName: inv.companyName,
    buyerGstin: inv.buyer.gstin,
    date: formatInvoiceDate(inv.issuedAt),
    description: inv.kind === "credit_note" ? `Against ${inv.original?.number ?? ""}` : [inv.planName, inv.interval === "yearly" ? "Yearly" : inv.interval === "monthly" ? "Monthly" : null].filter(Boolean).join(" · "),
    taxable: m(inv.taxable),
    tax: m(inv.taxTotal),
    taxSplit: inv.supplyType === "intra" ? `CGST ${m(inv.cgst)} + SGST ${m(inv.sgst)}` : "IGST",
    total: inv.kind === "credit_note" ? `− ${m(inv.total)}` : m(inv.total),
  };
}

export default async function PlatformInvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformPermission("invoices.read");
  const sp = await searchParams;
  const { values, filter, active } = parseInvoiceFilters(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const [list, companies, years] = await Promise.all([listSaasInvoices(filter, { page, pageSize: PAGE_SIZE }), listInvoicedCompanies(), listInvoiceFinancialYears()]);
  const t = list.totals;

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="SaaS invoices" description="Every GST tax invoice and credit note issued to companies — filter, export, download, mark paid, void or credit." crumbs={[{ label: "Billing" }]} />
      <KpiGrid cols={4}>
        <KpiCard label="Invoiced" value={formatMoney(t.total)} icon={<ReceiptText className="size-4" />} />
        <KpiCard label="GST on invoices" value={formatMoney(t.tax)} icon={<Landmark className="size-4" />} />
        <KpiCard label="Credited" value={formatMoney(t.credited)} icon={<Undo2 className="size-4" />} />
        <KpiCard label="Net invoiced" value={formatMoney(t.net)} icon={<IndianRupee className="size-4" />} />
      </KpiGrid>
      {t.outstanding > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
          <CircleAlert className="size-4" /> {formatMoney(t.outstanding)} outstanding on unpaid invoices.
        </p>
      )}
      <InvoicesGrid
        rows={list.rows.map(toRow)}
        total={list.total}
        page={page}
        totalPages={Math.max(1, Math.ceil(list.total / PAGE_SIZE))}
        hasActiveFilters={active}
        subtitle={`${t.invoiceCount} invoice${t.invoiceCount === 1 ? "" : "s"} · ${t.creditCount} credit note${t.creditCount === 1 ? "" : "s"} (void excluded from totals)`}
        filters={<InvoicesFilterBar initial={values} companies={companies} financialYears={years} />}
        toolbarExtra={
          <a id="invoice-export" href={`/console/invoices/export${filterQueryString(values)}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium hover:bg-muted">
            <FileDown className="size-4" /> Export CSV
          </a>
        }
      />
    </div>
  );
}
