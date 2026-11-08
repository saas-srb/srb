import { panelNameMap } from "@/lib/platform/panels/store";
import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import { SopStatusBadge, ConfidentialityBadge, PriorityBadge } from "@/components/products/playbook-ai/SopBadges";
import { CONFIDENTIALITY_LEVELS, SOP_MODULES, SOP_PRIORITIES, SOP_STATUSES, formatIsoDate } from "@/lib/products/playbook-ai/constants";
import { isReviewOverdue } from "@/lib/products/playbook-ai/lifecycle";
import { todayIso } from "@/lib/products/playbook-ai/db";
import type { LibraryQuery, LibraryResult } from "@/lib/products/playbook-ai/library";

/** The shared SOP list: used by the Library and by My SOPs. Cells are rendered on the server; the client shell only handles URL state. */
export default async function SopLibraryTable({
  result,
  query,
  canCreate,
  canExport,
  exportBase,
  emptyLabel,
}: {
  result: LibraryResult;
  query: LibraryQuery;
  canCreate: boolean;
  canExport: boolean;
  exportBase: string;
  emptyLabel?: string;
}) {
  const panelLabel = await panelNameMap();
  const today = todayIso();
  const statusValue = query.status.join(",");
  const statusOptions = [
    ...SOP_STATUSES.map((s) => ({ value: s.value as string, label: s.label })),
    { value: "published,active", label: "Published + Active" },
  ];

  const filters = [
    { key: "status", label: "Status", value: statusValue, options: statusOptions },
    { key: "department", label: "Department", value: query.department, options: result.facets.departments },
    { key: "function", label: "Function", value: query.functionId, options: result.facets.functions },
    { key: "process", label: "Process", value: query.process, options: result.facets.processes },
    { key: "category", label: "Category", value: query.category, options: result.facets.categories },
    { key: "priority", label: "Priority", value: query.priority, options: SOP_PRIORITIES.map((p) => ({ value: p.value as string, label: p.label })) },
    { key: "confidentiality", label: "Confidentiality", value: query.confidentiality, options: CONFIDENTIALITY_LEVELS.map((c) => ({ value: c.value as string, label: c.label })) },
    { key: "owner", label: "Owner", value: query.owner, options: result.facets.owners },
    { key: "author", label: "Author", value: query.author, options: result.facets.authors },
    { key: "module", label: "Product", value: query.module, options: SOP_MODULES.map((m) => ({ value: m.value as string, label: panelLabel(m.value, m.label) })) },
    {
      key: "attention",
      label: "Needs attention",
      value: query.attention,
      options: [
        { value: "expiring", label: "Expiring soon" },
        { value: "overdue_review", label: "Overdue review" },
        { value: "mandatory", label: "Mandatory" },
        { value: "unpublished_changes", label: "Unpublished changes" },
      ],
    },
    {
      key: "updated",
      label: "Updated",
      value: query.updated,
      options: [
        { value: "7", label: "Last 7 days" },
        { value: "30", label: "Last 30 days" },
        { value: "90", label: "Last 90 days" },
        { value: "365", label: "Last 12 months" },
      ],
    },
    ...(result.showCompliance
      ? [
          {
            key: "compliance",
            label: "Compliance",
            value: query.compliance,
            options: [
              { value: "complete", label: "Fully acknowledged" },
              { value: "pending", label: "Has pending" },
              { value: "overdue", label: "Has overdue" },
              { value: "unassigned", label: "Not assigned" },
            ],
          },
        ]
      : []),
  ];

  return (
    <FmsDataTable
      columns={[
        { key: "title", header: "SOP", sortable: true },
        { key: "department", header: "Department", sortable: true },
        { key: "category", header: "Category" },
        { key: "owner", header: "Owner" },
        { key: "version", header: "Version", sortable: true },
        { key: "status", header: "Status", sortable: true },
        { key: "review", header: "Review", sortable: true },
        { key: "expiry", header: "Expiry", sortable: true },
        ...(result.showCompliance ? [{ key: "ack", header: "Acknowledged" }] : []),
        { key: "updated", header: "Updated", sortable: true },
      ]}
      rows={result.items.map((s) => ({
        id: s._id,
        href: `/playbook-ai/library/${s._id}`,
        cells: {
          title: (
            <span className="block max-w-[22rem]">
              <span className="block truncate">{s.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
                <span className="font-mono">{s.code}</span>
                {s.mandatory && <span className="rounded bg-destructive/10 px-1 text-destructive">Mandatory</span>}
                {s.confidentiality !== "internal" && <ConfidentialityBadge level={s.confidentiality} />}
                {s.priority === "critical" || s.priority === "high" ? <PriorityBadge priority={s.priority} /> : null}
                {s.hasUnpublishedChanges && s.version && <span className="rounded bg-amber-500/15 px-1 text-amber-600 dark:text-amber-400">Unpublished changes</span>}
              </span>
            </span>
          ),
          department: (
            <span className="block">
              <span className="block">{s.departmentName}</span>
              {(s.functionName || s.processName) && (
                <span className="block max-w-[14rem] truncate text-[11px] text-muted-foreground">{[s.functionName, s.processName].filter(Boolean).join(" › ")}</span>
              )}
            </span>
          ),
          category: s.categoryName ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: s.categoryColor ?? "#94a3b8" }} />
              {s.categoryName}
            </span>
          ) : (
            "—"
          ),
          owner: s.ownerName,
          version: s.version ? `v${s.version}` : "—",
          status: <SopStatusBadge status={s.status} />,
          review: <span className={isReviewOverdue(s, today) ? "font-medium text-destructive" : undefined}>{formatIsoDate(s.reviewDate)}</span>,
          expiry: formatIsoDate(s.expiryDate),
          ack: s.ack ? (s.ack.assigned === 0 ? <span className="text-muted-foreground">Not assigned</span> : <span className={s.ack.overdue > 0 ? "font-medium text-destructive" : undefined}>{s.ack.acknowledged}/{s.ack.assigned} · {s.ack.rate}%</span>) : "—",
          updated: formatIsoDate(s.updatedAt.toISOString().slice(0, 10)),
        },
      }))}
      filters={filters}
      search={query.q}
      searchPlaceholder="Title, SOP ID, tag, owner, version…"
      sortBy={query.sortBy}
      sortDir={query.sortDir}
      page={result.page}
      totalPages={result.totalPages}
      total={result.total}
      emptyLabel={emptyLabel ?? "No SOPs match these filters."}
      exportBase={canExport ? exportBase : undefined}
      actions={
        canCreate ? (
          <Link href="/playbook-ai/library/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-3.5" data-icon="inline-start" />
            New SOP
          </Link>
        ) : undefined
      }
    />
  );
}
