"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Download, Eye, ScrollText } from "lucide-react";
import { toast } from "sonner";
import AdminDataGrid, { type AdminDataGridColumn } from "@/components/products/commandos/data-grid/AdminDataGrid";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/utils";
import type { AuditFilters } from "@/lib/platform/console/audit-log";
import { exportAuditCsvAction } from "./actions";

export interface AuditGridRow {
  id: string;
  at: string;
  actorId: string;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string;
  companyId: string | null;
  companyName: string | null;
  details: Record<string, unknown> | null;
}

export default function AuditLogGrid({
  rows,
  total,
  page,
  totalPages,
  filters,
  filtersValue,
  hasActiveFilters,
}: {
  rows: AuditGridRow[];
  total: number;
  page: number;
  totalPages: number;
  filters: ReactNode;
  filtersValue: AuditFilters;
  hasActiveFilters: boolean;
}) {
  const [open, setOpen] = useState<AuditGridRow | null>(null);
  const [exporting, start] = useTransition();

  const columns: AdminDataGridColumn<AuditGridRow>[] = [
    { key: "at", label: "When", cellClassName: "whitespace-nowrap text-xs", render: (r) => <span suppressHydrationWarning>{formatDateTime(r.at)}</span> },
    { key: "actor", label: "Actor", render: (r) => <span className="text-xs">{r.actorLabel}</span> },
    { key: "action", label: "Action", render: (r) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.action}</code> },
    {
      key: "target",
      label: "Target",
      render: (r) => (
        <span className="text-xs">
          {r.targetType}
          <span className="block max-w-48 truncate text-muted-foreground">{r.targetId}</span>
        </span>
      ),
    },
    {
      key: "company",
      label: "Company",
      render: (r) =>
        r.companyId ? (
          <Link href={`/console/companies/${r.companyId}`} className="text-xs hover:underline">
            {r.companyName ?? r.companyId}
          </Link>
        ) : (
          "—"
        ),
    },
  ];

  function exportCsv() {
    start(async () => {
      const res = await exportAuditCsvAction(filtersValue);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `platform-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(res.truncated ? `Exported the newest ${res.rows} entries — narrow the filters for the rest.` : `Exported ${res.rows} entries.`);
    });
  }

  return (
    <>
      <AdminDataGrid
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        total={total}
        page={page}
        totalPages={totalPages}
        emptyLabel="No audit entries match these filters."
        filters={filters}
        filterTitle="Audit log"
        filterSubtitle={`${total} entr${total === 1 ? "y" : "ies"}`}
        filterIcon={ScrollText}
        hasActiveFilters={hasActiveFilters}
        toolbarExtra={
          <Button type="button" size="sm" variant="outline" id="audit-export" onClick={exportCsv} disabled={exporting || total === 0}>
            <Download className="size-3.5" data-icon="inline-start" /> {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        }
        rowActions={(r) => (
          <button type="button" aria-label={`Details of ${r.action}`} data-audit-row={r.id} onClick={() => setOpen(r)} className="text-muted-foreground hover:text-foreground">
            <Eye className="size-4" />
          </button>
        )}
      />

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.action}</SheetTitle>
                <SheetDescription suppressHydrationWarning>{formatDateTime(open.at)}</SheetDescription>
              </SheetHeader>
              <dl className="grid gap-3 px-4 text-sm">
                {(
                  [
                    ["Actor", `${open.actorLabel}${open.actorLabel !== open.actorId ? ` (${open.actorId})` : ""}`],
                    ["Target", `${open.targetType} · ${open.targetId}`],
                    ["Company", open.companyId ? `${open.companyName ?? "—"} (${open.companyId})` : "—"],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
                    <dd className="break-all text-foreground">{v}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Details</dt>
                  <dd>
                    <pre id="audit-details-json" className="mt-1 max-h-[50vh] overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                      {open.details ? JSON.stringify(open.details, null, 2) : "No details recorded."}
                    </pre>
                  </dd>
                </div>
              </dl>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
