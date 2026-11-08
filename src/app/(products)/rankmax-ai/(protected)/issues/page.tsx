import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import EditDialog from "@/components/products/playbook-ai/EditDialog";
import { BulkIssueBar } from "@/components/products/rankmax-ai/IssueControls";
import { PageHeader, SeverityBadge, IssueStatusBadge, CategoryBadge } from "@/components/products/rankmax-ai/SeoUi";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { listIssues, issueStats } from "@/lib/products/rankmax-ai/issues";
import { listSeoUsers } from "@/lib/products/rankmax-ai/people";
import { CATEGORIES, CATEGORY_LABEL, CHECKS, ISSUE_STATUSES, ISSUE_STATUS_LABEL, SEVERITIES, SEVERITY_META, isCheckId } from "@/lib/products/rankmax-ai/checks";
import { createIssueAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { formatDateTime } from "@/lib/utils";

export default async function IssuesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const sp = await searchParams;
  const status = sp.status ?? "active";
  const [list, stats, users] = await Promise.all([listIssues({ ...sp, status, page: Math.max(Number(sp.page) || 1, 1), pageSize: 40 }), issueStats(), listSeoUsers()]);
  const userOpts = users.map((u) => ({ value: u.id, label: u.label }));
  const uById = new Map(userOpts.map((u) => [u.value, u.label]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="SEO Issues"
        crumbs={[{ label: "SEO Issues" }]}
        description={<>{stats.active} open · {stats.bySeverity.critical} critical · {stats.byStatus.resolved} resolved · {stats.byStatus.ignored} ignored. Audit issues auto-resolve when a later audit verifies the fix, and re-open if the problem returns.{sp.checkId && isCheckId(sp.checkId) && <> Showing “{CHECKS[sp.checkId].title}”.</>}{sp.path && <> Showing {sp.path}.</>}</>}
        actions={
          can(viewer, "CREATE") && (
            <EditDialog
              trigger={<Button size="sm"><Plus className="size-3.5" data-icon="inline-start" />Log issue</Button>}
              title="Log an SEO issue"
              description="For problems the crawler can't see (e.g. found in Search Console or by hand)."
              columns={2}
              fields={[
                { key: "title", label: "Issue", type: "text", maxLength: 200 },
                { key: "path", label: "URL (site path)", type: "text", placeholder: "/services" },
                { key: "severity", label: "Severity", type: "select", options: SEVERITIES.map((s) => ({ value: s, label: SEVERITY_META[s].label })) },
                { key: "category", label: "Category", type: "select", options: CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })) },
                { key: "assigneeId", label: "Assign to", type: "select", noneLabel: "Unassigned", options: userOpts },
                { key: "description", label: "Description", type: "textarea" },
                { key: "recommendation", label: "Recommendation", type: "textarea" },
              ]}
              initial={{ title: "", path: "/", severity: "medium", category: "technical", assigneeId: "", description: "", recommendation: "" }}
              onSubmit={async (v) => {
                "use server";
                return createIssueAction(v);
              }}
            />
          )
        }
      />
      <FmsDataTable
        columns={[
          { key: "severity", header: "Severity", sortable: true },
          { key: "title", header: "Issue" },
          { key: "path", header: "URL", sortable: true },
          { key: "category", header: "Category" },
          { key: "status", header: "Status" },
          { key: "assignee", header: "Assigned" },
          { key: "firstSeenAt", header: "Created", sortable: true },
          { key: "lastSeenAt", header: "Last seen", sortable: true },
        ]}
        rows={list.items.map((i) => ({
          id: i._id,
          href: `/rankmax-ai/issues/${i._id}`,
          cells: {
            severity: <SeverityBadge severity={i.severity} />,
            title: <span className="block max-w-[280px] truncate font-medium" title={i.details[0]}>{i.title}</span>,
            path: <span className="block max-w-[220px] truncate text-xs">{i.path}</span>,
            category: <CategoryBadge category={i.category} />,
            status: <IssueStatusBadge status={i.status} />,
            assignee: <span className="text-xs">{i.assigneeId ? uById.get(i.assigneeId) ?? "—" : "—"}</span>,
            firstSeenAt: <span className="text-xs text-muted-foreground">{formatDateTime(i.firstSeenAt)}</span>,
            lastSeenAt: <span className="text-xs text-muted-foreground">{i.resolvedAt ? `Resolved ${formatDateTime(i.resolvedAt)}` : formatDateTime(i.lastSeenAt)}</span>,
          },
        }))}
        filters={[
          { key: "status", label: "Status", value: status, options: [{ value: "active", label: "Open + In progress" }, ...ISSUE_STATUSES.map((s) => ({ value: s, label: ISSUE_STATUS_LABEL[s] }))] },
          { key: "severity", label: "Severity", value: sp.severity ?? "", options: SEVERITIES.map((s) => ({ value: s, label: SEVERITY_META[s].label })) },
          { key: "category", label: "Category", value: sp.category ?? "", options: CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })) },
          { key: "assignee", label: "Assigned", value: sp.assignee ?? "", options: [{ value: "unassigned", label: "Unassigned" }, ...userOpts] },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Issue, URL or notes"
        sortBy={sp.sortBy ?? "severity"}
        sortDir={sp.sortDir ?? "desc"}
        page={list.page}
        totalPages={list.totalPages}
        total={list.total}
        exportBase={can(viewer, "EXPORT_REPORTS") ? "/api/rankmax-ai/export/issues" : undefined}
        emptyLabel="No issues match — nice."
      />
      {can(viewer, "EDIT") && <BulkIssueBar ids={list.items.map((i) => i._id)} />}
    </div>
  );
}
