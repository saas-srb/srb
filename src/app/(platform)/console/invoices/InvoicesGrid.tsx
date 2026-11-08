"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Download, ReceiptText } from "lucide-react";
import AdminDataGrid, { type AdminDataGridColumn } from "@/components/products/commandos/data-grid/AdminDataGrid";
import InvoiceStatusBadge from "./InvoiceStatusBadge";

/** Pre-formatted on the server (IST dates, money strings) so server and client render identically. */
export interface PanelInvoiceRow {
  id: string;
  number: string;
  kind: "invoice" | "credit_note";
  status: string;
  credited: "full" | "partial" | null;
  companyId: string;
  companyName: string;
  buyerGstin: string | null;
  date: string;
  description: string;
  taxable: string;
  tax: string;
  taxSplit: string;
  total: string;
}

const columns: AdminDataGridColumn<PanelInvoiceRow>[] = [
  {
    key: "number",
    label: "Number",
    render: (row) => (
      <Link href={`/console/invoices/${row.id}`} className="font-medium text-foreground hover:underline" data-invoice-link={row.number}>
        {row.number}
      </Link>
    ),
  },
  {
    key: "company",
    label: "Company",
    render: (row) => (
      <Link href={`/console/companies/${row.companyId}`} className="block hover:underline">
        <span className="font-medium text-foreground">{row.companyName}</span>
        <span className="block text-xs">{row.buyerGstin ?? "Unregistered"}</span>
      </Link>
    ),
  },
  { key: "status", label: "Status", render: (row) => <InvoiceStatusBadge kind={row.kind} status={row.status} credited={row.credited} /> },
  { key: "date", label: "Date", render: (row) => row.date },
  { key: "description", label: "For", defaultVisible: false, render: (row) => <span className="text-xs">{row.description}</span> },
  { key: "taxable", label: "Taxable", cellClassName: "tabular-nums", render: (row) => row.taxable },
  {
    key: "tax",
    label: "GST",
    cellClassName: "tabular-nums",
    render: (row) => (
      <>
        {row.tax}
        <span className="block text-xs">{row.taxSplit}</span>
      </>
    ),
  },
  { key: "total", label: "Total", cellClassName: "tabular-nums font-medium text-foreground", render: (row) => row.total },
];

export default function InvoicesGrid({
  rows,
  total,
  page,
  totalPages,
  filters,
  hasActiveFilters,
  subtitle,
  toolbarExtra,
}: {
  rows: PanelInvoiceRow[];
  total: number;
  page: number;
  totalPages: number;
  filters: ReactNode;
  hasActiveFilters: boolean;
  subtitle: string;
  toolbarExtra?: ReactNode;
}) {
  return (
    <AdminDataGrid
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      total={total}
      page={page}
      totalPages={totalPages}
      emptyLabel="No invoices match these filters."
      filters={filters}
      filterTitle="SaaS invoices"
      filterSubtitle={subtitle}
      filterIcon={ReceiptText}
      hasActiveFilters={hasActiveFilters}
      toolbarExtra={toolbarExtra}
      rowActions={(row) => (
        <a href={`/api/platform/billing/invoices/${row.id}/pdf?download=1`} aria-label={`Download ${row.number}`} className="text-muted-foreground hover:text-foreground">
          <Download className="size-4" />
        </a>
      )}
    />
  );
}
