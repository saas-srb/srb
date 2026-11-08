"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import AdminDataGrid, { type AdminDataGridColumn } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { formatDateTime } from "@/lib/utils";
import { AUDIT_SOURCE_LABELS, type AuditRow } from "@/lib/products/commandos/activity-log-shared";

/** The "All" source: workspace events and product activity in one timeline. */
export default function MergedAuditGrid({ rows, total, page, totalPages, filters, hasActiveFilters }: { rows: AuditRow[]; total: number; page: number; totalPages: number; filters?: React.ReactNode; hasActiveFilters?: boolean }) {
  const columns: AdminDataGridColumn<AuditRow>[] = [
    { key: "source", label: "Source", render: (r) => <Badge variant="outline">{AUDIT_SOURCE_LABELS[r.source]}</Badge> },
    { key: "what", label: "What happened", render: (r) => <span className="font-medium text-foreground capitalize">{r.what}</span> },
    {
      key: "subject",
      label: "Subject",
      render: (r) => (r.url && r.subject ? <Link href={r.url} className="text-primary underline-offset-4 hover:underline">{r.subject}</Link> : r.subject || "—"),
    },
    { key: "summary", label: "Summary", render: (r) => r.summary ?? "—" },
    { key: "actor", label: "Actor", render: (r) => r.actor },
    { key: "at", label: "When", sortable: false, render: (r) => formatDateTime(r.at) },
  ];
  return (
    <AdminDataGrid
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
      total={total}
      page={page}
      totalPages={totalPages}
      emptyLabel="No activity matches these filters."
      filters={filters}
      filterTitle="Audit log filters"
      filterSubtitle="Workspace events and product activity, newest first"
      filterIcon={History}
      hasActiveFilters={hasActiveFilters}
    />
  );
}
