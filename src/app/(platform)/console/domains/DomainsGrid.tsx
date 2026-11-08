"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import AdminDataGrid, { type AdminDataGridColumn } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { formatDateTime } from "@/lib/utils";
import type { PlatformDomainRow } from "@/lib/platform/domains/overview";
import { DnsBadge, ProviderBadge, SslBadge } from "./DomainBadges";
import DomainActions from "./DomainActions";

const columns: AdminDataGridColumn<PlatformDomainRow>[] = [
  {
    key: "host",
    label: "Domain",
    render: (r) => (
      <span className="block min-w-40">
        <span className="font-medium break-all text-foreground">{r.host}</span>
        <span className="mt-0.5 flex flex-wrap gap-1">
          <Badge variant="outline">{r.kind === "subdomain" ? "Subdomain" : "Custom"}</Badge>
          {r.isPrimary && <Badge variant="outline">Primary</Badge>}
        </span>
      </span>
    ),
  },
  {
    key: "company",
    label: "Company",
    render: (r) => (
      <Link href={`/console/companies/${r.companyId}`} className="block hover:underline">
        <span className="font-medium text-foreground">{r.companyName}</span>
        {r.companyStatus === "suspended" && <span className="block text-xs text-destructive">Suspended</span>}
      </Link>
    ),
  },
  { key: "dns", label: "DNS verification", render: (r) => <DnsBadge status={r.status} /> },
  { key: "ssl", label: "SSL", render: (r) => <SslBadge ssl={r.hosting.ssl} error={r.hosting.error} /> },
  { key: "provider", label: "Provider", render: (r) => <ProviderBadge hosting={r.hosting} /> },
  { key: "checked", label: "Last checked", render: (r) => <span className="text-xs whitespace-nowrap">{r.lastCheckedAt ? formatDateTime(r.lastCheckedAt) : "Never"}</span> },
  {
    key: "errors",
    label: "Errors",
    render: (r) => {
      const msgs = [r.hosting.error, r.status === "pending" ? r.dnsDetail : null, ...r.records.filter((x) => x.state !== "ok").map((x) => `${x.type} ${x.name} ${x.state === "unknown" ? "not checked" : x.state}`)].filter(Boolean);
      return msgs.length ? <span className="block max-w-72 text-xs break-words text-muted-foreground">{msgs.join(" · ")}</span> : <span className="text-xs text-muted-foreground">—</span>;
    },
  },
];

export default function DomainsGrid({ rows, total, page, totalPages, filters, hasActiveFilters }: { rows: PlatformDomainRow[]; total: number; page: number; totalPages: number; filters: ReactNode; hasActiveFilters: boolean }) {
  return (
    <AdminDataGrid
      columns={columns}
      rows={rows}
      getRowId={(r) => r.host}
      total={total}
      page={page}
      totalPages={totalPages}
      emptyLabel="No domains match these filters."
      filters={filters}
      filterTitle="Domains"
      filterSubtitle={`${total} domain${total === 1 ? "" : "s"}`}
      filterIcon={Globe}
      hasActiveFilters={hasActiveFilters}
      rowActions={(r) => (
        <DomainActions domain={{ host: r.host, companyName: r.companyName, kind: r.kind, status: r.status, isPrimary: r.isPrimary, removable: r.removable, localOnly: r.hosting.providerId === null }} />
      )}
    />
  );
}
