"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import AdminDataGrid, { type AdminDataGridColumn } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { formatDate } from "@/lib/utils";
import type { CompanyRow } from "@/lib/platform/console/companies";
import StatusBadge from "./StatusBadge";
import LoginAsCompanyButton from "./LoginAsCompanyButton";

const buildColumns = (canImpersonate: boolean): AdminDataGridColumn<CompanyRow>[] => [
  {
    key: "name",
    label: "Company",
    render: (row) => (
      <Link href={`/console/companies/${row.id}`} className="block hover:underline">
        <span className="font-medium text-foreground">{row.name}</span>
        <span className="block text-xs">{row.slug}</span>
      </Link>
    ),
  },
  { key: "owner", label: "Owner", render: (row) => row.ownerEmail ?? "—" },
  { key: "users", label: "Users", cellClassName: "tabular-nums", render: (row) => row.userCount },
  {
    key: "domains",
    label: "Domains",
    render: (row) =>
      row.domains.length ? (
        <span className="text-xs">
          {row.domains[0]}
          {row.domains.length > 1 && ` +${row.domains.length - 1}`}
        </span>
      ) : (
        "—"
      ),
  },
  {
    key: "onboarding",
    label: "Setup",
    render: (row) =>
      row.isPlatformOwner ? (
        "—"
      ) : (
        <span className="text-xs tabular-nums">
          {row.onboarding.done}/{row.onboarding.total}
          {row.onboarding.completedAt ? " · done" : row.onboarding.dismissedAt ? " · skipped" : ""}
        </span>
      ),
  },
  { key: "createdAt", label: "Created", render: (row) => formatDate(row.createdAt) },
  { key: "status", label: "Status", render: (row) => (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusBadge status={row.status} isPlatformOwner={row.isPlatformOwner} />
      {row.reactivationPending && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Reactivation requested</span>}
    </span>
  ) },
  { key: "access", label: "", render: (row) => (!canImpersonate || row.isPlatformOwner || row.status !== "active" ? null : <LoginAsCompanyButton companyId={row.id} companyName={row.name} label="Login" />) },
];

export default function CompaniesGrid({
  rows,
  total,
  page,
  totalPages,
  filters,
  hasActiveFilters,
  canImpersonate = false,
}: {
  rows: CompanyRow[];
  total: number;
  page: number;
  totalPages: number;
  filters: ReactNode;
  hasActiveFilters: boolean;
  /** May sign in as a company's Director (`companies.impersonate`). */
  canImpersonate?: boolean;
}) {
  return (
    <AdminDataGrid
      columns={buildColumns(canImpersonate)}
      rows={rows}
      getRowId={(row) => row.id}
      total={total}
      page={page}
      totalPages={totalPages}
      emptyLabel="No companies match these filters."
      filters={filters}
      filterTitle="Companies"
      filterSubtitle={`${total} compan${total === 1 ? "y" : "ies"}`}
      filterIcon={Building2}
      hasActiveFilters={hasActiveFilters}
      rowActions={(row) => (
        <Link href={`/console/companies/${row.id}`} aria-label={`Open ${row.name}`} className="text-muted-foreground hover:text-foreground">
          <ChevronRight className="size-4" />
        </Link>
      )}
    />
  );
}
