"use client";

import Link from "next/link";
import { ChevronRight, PackagePlus } from "lucide-react";
import AdminDataGrid, { type AdminDataGridColumn } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/platform/billing/types";
import { describeAddonEffect, type Addon } from "@/lib/platform/billing/catalog-types";

export type AddonRow = Addon & { holders: number; planNames: string };

const columns: AdminDataGridColumn<AddonRow>[] = [
  {
    key: "name",
    label: "Add-on",
    render: (row) => (
      <Link href={`/console/addons/${row._id}`} className="block hover:underline">
        <span className="font-medium text-foreground">{row.name}</span>
        {row.description && <span className="block max-w-56 truncate text-xs">{row.description}</span>}
      </Link>
    ),
  },
  { key: "effect", label: "Gives", render: (row) => <span className="text-xs">{describeAddonEffect(row)}</span> },
  {
    key: "price",
    label: "Price / unit",
    cellClassName: "tabular-nums",
    render: (row) => (
      <span className="text-xs">
        {formatMoney(row.priceMonthly, row.currency)}/mo · {formatMoney(row.priceYearly, row.currency)}/yr
      </span>
    ),
  },
  { key: "plans", label: "Plans", render: (row) => <span className="text-xs">{row.planNames}</span> },
  { key: "max", label: "Max units", cellClassName: "tabular-nums", render: (row) => row.maxQuantity ?? "∞" },
  {
    key: "holders",
    label: "Companies",
    cellClassName: "tabular-nums",
    render: (row) => <span data-testid={`holders-${row._id}`}>{row.holders}</span>,
  },
  {
    key: "status",
    label: "Status",
    render: (row) => (row.active ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Active</Badge> : <Badge variant="destructive">Inactive</Badge>),
  },
];

export default function AddonsGrid({ rows }: { rows: AddonRow[] }) {
  return (
    <AdminDataGrid
      columns={columns}
      rows={rows}
      getRowId={(row) => row._id}
      total={rows.length}
      page={1}
      totalPages={1}
      emptyLabel="No add-ons yet."
      filterTitle="Add-ons"
      filterSubtitle={`${rows.length} add-on${rows.length === 1 ? "" : "s"}`}
      filterIcon={PackagePlus}
      rowActions={(row) => (
        <Link href={`/console/addons/${row._id}`} aria-label={`Open ${row.name}`} className="text-muted-foreground hover:text-foreground">
          <ChevronRight className="size-4" />
        </Link>
      )}
    />
  );
}
