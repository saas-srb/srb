import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Clock, AlertTriangle, CheckCheck } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { AssignmentStateBadge, SopStatusBadge } from "@/components/products/playbook-ai/SopBadges";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { getAssignedToMe } from "@/lib/products/playbook-ai/analytics";
import { formatIsoDate } from "@/lib/products/playbook-ai/constants";
import { formatDate } from "@/lib/utils";

export default async function AssignedSopsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const rows = await getAssignedToMe(viewer);
  const count = (s: string) => rows.filter((r) => r.state === s).length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SOP", href: "/playbook-ai" }, { label: "Assigned SOPs" }]}
        title={<>Assigned SOPs</>}
        description={<>Procedures assigned to you. Open one, read it, complete any checklist, then acknowledge it.</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Assigned" value={rows.length} accent icon={<ClipboardList className="size-4" />} />
        <KpiCard label="Pending" value={count("pending")} icon={<Clock className="size-4" />} />
        <KpiCard label="Overdue" value={count("overdue")} tone={count("overdue") > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
        <KpiCard label="Acknowledged" value={count("acknowledged")} tone={rows.length > 0 && count("acknowledged") === rows.length ? "up" : undefined} icon={<CheckCheck className="size-4" />} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SOP</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Assigned by</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Checklist</TableHead>
                <TableHead>Viewed</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">Nothing has been assigned to you.</TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.assignment._id}>
                  <TableCell>
                    <Link href={`/playbook-ai/library/${r.sop._id}`} className="font-medium hover:underline">{r.sop.title}</Link>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">{r.sop.code}</span>
                      {r.sop.status !== "active" && <SopStatusBadge status={r.sop.status} />}
                    </span>
                  </TableCell>
                  <TableCell>
                    v{r.sop.version}
                    {r.assignment.acknowledgedVersion && r.assignment.acknowledgedVersion !== r.sop.version && (
                      <span className="block text-[11px] text-amber-600 dark:text-amber-400">you read v{r.assignment.acknowledgedVersion}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.assignment.source.type === "self" ? "Self" : r.assignment.assignedByName}
                    <span className="block text-[11px]">{formatDate(r.assignment.assignedAt)}</span>
                  </TableCell>
                  <TableCell>
                    {formatIsoDate(r.assignment.dueDate)}
                    {r.state !== "acknowledged" && r.daysUntilDue !== null && (
                      <span className={`block text-[11px] ${r.daysUntilDue < 0 ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                        {r.daysUntilDue < 0 ? `${-r.daysUntilDue}d overdue` : r.daysUntilDue === 0 ? "due today" : `in ${r.daysUntilDue}d`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.checklist.total > 0 ? `${r.checklist.done}/${r.checklist.total}` : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.assignment.viewedAt ? formatDate(r.assignment.viewedAt) : "Not yet"}</TableCell>
                  <TableCell><AssignmentStateBadge state={r.state} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
