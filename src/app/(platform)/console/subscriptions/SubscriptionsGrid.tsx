"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Repeat } from "lucide-react";
import AdminDataGrid, { type AdminDataGridColumn } from "@/components/products/commandos/data-grid/AdminDataGrid";
import SubscriptionStatusBadge from "@/components/platform/billing/SubscriptionStatusBadge";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/platform/billing/types";
import type { SubscriptionRow } from "@/lib/platform/billing/subscriptions-admin";

const columns: AdminDataGridColumn<SubscriptionRow>[] = [
  {
    key: "name",
    label: "Company",
    render: (row) => (
      <Link href={`/console/subscriptions/${row.companyId}`} className="block hover:underline">
        <span className="font-medium text-foreground">{row.name}</span>
        <span className="block text-xs">{row.slug}</span>
      </Link>
    ),
  },
  { key: "plan", label: "Plan", render: (row) => row.planName },
  { key: "interval", label: "Cycle", render: (row) => (row.status === "internal" ? "—" : row.interval === "yearly" ? "Yearly" : "Monthly") },
  { key: "status", label: "Status", render: (row) => <SubscriptionStatusBadge status={row.status} complimentary={row.complimentary} cancelAtPeriodEnd={row.cancelAtPeriodEnd} /> },
  { key: "trial", label: "Trial ends", render: (row) => (row.status === "trialing" && row.trialEndsAt ? formatDate(row.trialEndsAt) : "—") },
  { key: "renewal", label: "Renews", render: (row) => (row.renewsAt ? (row.cancelAtPeriodEnd ? `Ends ${formatDate(row.renewsAt)}` : formatDate(row.renewsAt)) : "—") },
  { key: "mrr", label: "MRR", cellClassName: "tabular-nums", render: (row) => (row.mrr ? formatMoney(row.mrr, row.currency) : "—") },
];

export default function SubscriptionsGrid({
  rows,
  total,
  page,
  totalPages,
  filters,
  hasActiveFilters,
}: {
  rows: SubscriptionRow[];
  total: number;
  page: number;
  totalPages: number;
  filters: ReactNode;
  hasActiveFilters: boolean;
}) {
  return (
    <AdminDataGrid
      columns={columns}
      rows={rows}
      getRowId={(row) => row.companyId}
      total={total}
      page={page}
      totalPages={totalPages}
      emptyLabel="No subscriptions match these filters."
      filters={filters}
      filterTitle="Subscriptions"
      filterSubtitle={`${total} compan${total === 1 ? "y" : "ies"}`}
      filterIcon={Repeat}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => (
        <Link href={`/console/subscriptions/${row.companyId}`} aria-label={`Open ${row.name}`} className="text-muted-foreground hover:text-foreground">
          <ChevronRight className="size-4" />
        </Link>
      )}
    />
  );
}
