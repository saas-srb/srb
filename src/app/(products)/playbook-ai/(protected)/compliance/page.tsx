import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCheck, Clock, ClipboardList, Download } from "lucide-react";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import RateBar from "@/components/products/playbook-ai/RateBar";
import { SopStatusBadge } from "@/components/products/playbook-ai/SopBadges";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { canViewCompliance } from "@/lib/products/playbook-ai/access";
import { getCompliance } from "@/lib/products/playbook-ai/analytics";
import { formatIsoDate } from "@/lib/products/playbook-ai/constants";
import { sopCan } from "@/lib/sop-roles";

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <GlassCard interactive={false}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-bold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="max-h-96 overflow-auto">{children}</CardContent>
    </GlassCard>
  );
}

export default async function CompliancePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  if (!canViewCompliance(viewer)) redirect("/playbook-ai");
  const c = await getCompliance(viewer);
  const canExport = sopCan({ roles: viewer.roles, permissionOverrides: viewer.overrides }, "EXPORT");
  const empty = (cols: number, label: string) => (
    <TableRow><TableCell colSpan={cols} className="text-center text-muted-foreground">{label}</TableCell></TableRow>
  );

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SOP", href: "/playbook-ai" }, { label: "Compliance" }]}
        title={<>Compliance</>}
        description={<>Acknowledgements, overdue reviews and expiry — {c.scopeLabel}.</>}
        actions={<>{canExport && (
          <div className="flex gap-2">
            <a href="/api/playbook-ai/export/compliance?format=csv" className={buttonVariants({ variant: "outline", size: "sm" })}><Download className="size-3.5" data-icon="inline-start" />Department CSV</a>
            <a href="/api/playbook-ai/export/acknowledgements?format=xlsx" className={buttonVariants({ variant: "outline", size: "sm" })}><Download className="size-3.5" data-icon="inline-start" />Acknowledgements Excel</a>
          </div>
        )}</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Acknowledgement rate" value={c.overall.rate === null ? <span className="text-muted-foreground">No assignments</span> : <span>{c.overall.rate}%</span>} accent icon={<CheckCheck className="size-4" />} />
        <KpiCard label="Assignments" value={c.overall.assigned} icon={<ClipboardList className="size-4" />} />
        <KpiCard label="Pending" value={c.overall.pending} icon={<Clock className="size-4" />} />
        <KpiCard label="Overdue" value={c.overall.overdue} tone={c.overall.overdue > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
      </KpiGrid>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="By department" description="Acknowledgement rate of the people in each department">
          <Table>
            <TableHeader><TableRow><TableHead>Department</TableHead><TableHead className="text-right">SOPs</TableHead><TableHead className="text-right">Assigned</TableHead><TableHead className="text-right">Overdue</TableHead><TableHead>Rate</TableHead></TableRow></TableHeader>
            <TableBody>
              {c.byDepartment.length === 0 && empty(5, "Nothing assigned yet.")}
              {c.byDepartment.map((d) => (
                <TableRow key={d.departmentId}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.liveSops}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.assigned}</TableCell>
                  <TableCell className={`text-right tabular-nums ${d.overdue ? "font-medium text-destructive" : ""}`}>{d.overdue}</TableCell>
                  <TableCell><RateBar rate={d.rate} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>

        <Panel title="Overdue acknowledgements" description="People who missed a due date — open the SOP to send a reminder">
          <Table>
            <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>SOP</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Late</TableHead></TableRow></TableHeader>
            <TableBody>
              {c.overdue.length === 0 && empty(4, "No overdue acknowledgements. 🎉")}
              {c.overdue.map((o) => (
                <TableRow key={`${o.sopId}-${o.userId}`}>
                  <TableCell><span className="font-medium">{o.userName}</span><span className="block text-[11px] text-muted-foreground">{o.departmentName}</span></TableCell>
                  <TableCell><Link href={`/playbook-ai/library/${o.sopId}?tab=assignments`} className="hover:underline"><span className="font-mono text-xs text-muted-foreground">{o.sopCode}</span> {o.sopTitle}</Link></TableCell>
                  <TableCell className="whitespace-nowrap">{formatIsoDate(o.dueDate)}</TableCell>
                  <TableCell className="text-right font-medium text-destructive">{o.daysOverdue}d</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>

        <Panel title="By SOP" description="Lowest acknowledgement first">
          <Table>
            <TableHeader><TableRow><TableHead>SOP</TableHead><TableHead className="text-right">Assigned</TableHead><TableHead className="text-right">Pending</TableHead><TableHead className="text-right">Overdue</TableHead><TableHead>Rate</TableHead></TableRow></TableHeader>
            <TableBody>
              {c.bySop.length === 0 && empty(5, "No SOP has been assigned yet.")}
              {c.bySop.map((s) => (
                <TableRow key={s.sopId}>
                  <TableCell><Link href={`/playbook-ai/library/${s.sopId}?tab=assignments`} className="font-medium hover:underline">{s.title}</Link><span className="block text-[11px] text-muted-foreground"><span className="font-mono">{s.code}</span> · {s.departmentName}{s.mandatory ? " · Mandatory" : ""}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{s.assigned}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.pending}</TableCell>
                  <TableCell className={`text-right tabular-nums ${s.overdue ? "font-medium text-destructive" : ""}`}>{s.overdue}</TableCell>
                  <TableCell><RateBar rate={s.rate} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>

        <Panel title="Reviews & expiry" description="SOPs whose review is overdue or that expire soon">
          <Table>
            <TableHeader><TableRow><TableHead>SOP</TableHead><TableHead>Status</TableHead><TableHead>Review</TableHead><TableHead>Expiry</TableHead></TableRow></TableHeader>
            <TableBody>
              {c.reviewOverdue.length + c.expiringSoon.length === 0 && empty(4, "Nothing needs attention.")}
              {[...c.reviewOverdue, ...c.expiringSoon.filter((e) => !c.reviewOverdue.some((r) => r._id === e._id))].map((s) => (
                <TableRow key={s._id}>
                  <TableCell><Link href={`/playbook-ai/library/${s._id}`} className="font-medium hover:underline">{s.title}</Link><span className="block font-mono text-[11px] text-muted-foreground">{s.code}</span></TableCell>
                  <TableCell><SopStatusBadge status={s.status} /></TableCell>
                  <TableCell className={c.reviewOverdue.some((r) => r._id === s._id) ? "font-medium text-destructive" : ""}>{formatIsoDate(s.reviewDate)}</TableCell>
                  <TableCell>{formatIsoDate(s.expiryDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>

      {c.unassignedMandatory.length > 0 && (
        <Panel title="Mandatory SOPs with no assignments" description="Nobody has to acknowledge these yet — assign them from the SOP page">
          <ul className="divide-y divide-border/40 text-sm">
            {c.unassignedMandatory.map((s) => (
              <li key={s._id}><Link href={`/playbook-ai/library/${s._id}?tab=assignments`} className="flex items-center justify-between gap-3 py-2 hover:text-primary"><span className="truncate"><span className="mr-2 font-mono text-xs text-muted-foreground">{s.code}</span>{s.title}</span><span className="shrink-0 text-xs text-primary">Assign →</span></Link></li>
            ))}
          </ul>
        </Panel>
      )}
</PanelListFilters>
    </div>
  );
}
