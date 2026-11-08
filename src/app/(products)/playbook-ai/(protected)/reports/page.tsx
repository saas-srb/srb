import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, FileSpreadsheet } from "lucide-react";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import RateBar from "@/components/products/playbook-ai/RateBar";
import { BarsChart, TrendChart } from "@/components/products/playbook-ai/SopCharts";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { canViewCompliance } from "@/lib/products/playbook-ai/access";
import { getCompliance, getDashboard } from "@/lib/products/playbook-ai/analytics";
import { listVisibleSummaries } from "@/lib/products/playbook-ai/sops";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import { SOP_STATUSES } from "@/lib/products/playbook-ai/constants";
import { sopCan } from "@/lib/sop-roles";

const REPORTS = [
  { type: "library", title: "SOP inventory", description: "Every SOP you can access with owner, version, status, dates and acknowledgement counts.", needsCompliance: false },
  { type: "reviews", title: "Review & expiry schedule", description: "Review and expiry dates in order, flagging overdue reviews.", needsCompliance: false },
  { type: "compliance", title: "Department compliance", description: "Assigned / acknowledged / overdue per department.", needsCompliance: true },
  { type: "acknowledgements", title: "Acknowledgement detail", description: "One row per person per SOP: assigned, viewed, acknowledged and version.", needsCompliance: true },
] as const;

export default async function ReportsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  const monitor = canViewCompliance(viewer);
  const canExport = sopCan(ctx, "EXPORT");
  if (!monitor && !canExport) redirect("/playbook-ai");

  const [d, summaries, tax] = await Promise.all([getDashboard(viewer), listVisibleSummaries(viewer), getTaxonomy()]);
  const comp = monitor ? await getCompliance(viewer) : null;

  // Department × status matrix.
  const statuses = SOP_STATUSES.filter((s) => s.value !== "archived");
  const matrix = tax.departments
    .map((dep) => {
      const mine = summaries.filter((s) => s.departmentId === dep._id);
      return { id: dep._id, name: dep.name, total: mine.filter((s) => s.status !== "archived").length, byStatus: Object.fromEntries(statuses.map((st) => [st.value, mine.filter((s) => s.status === st.value).length])) as Record<string, number> };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SOP", href: "/playbook-ai" }, { label: "Reports & Analytics" }]}
        title={<>Reports & Analytics</>}
        description={<>Trends, coverage and exportable reports — scoped to what you can access.</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="SOPs" value={d.kpis.total} accent />
        <KpiCard label="In force (published/active)" value={d.kpis.published} />
        <KpiCard label="Overdue reviews" value={d.kpis.overdueReviews} tone={d.kpis.overdueReviews > 0 ? "down" : undefined} />
        <KpiCard label="Department coverage" value={<span>{d.kpis.coverage.pct}%</span>} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard interactive={false}>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-bold">SOPs created per month</CardTitle></CardHeader>
          <CardContent><TrendChart data={d.creationTrend} id="rep-create" /></CardContent>
        </GlassCard>
        <GlassCard interactive={false}>
          <CardHeader className="pb-1"><CardTitle className="text-sm font-bold">Versions published per month</CardTitle></CardHeader>
          <CardContent><TrendChart data={d.updateTrend} id="rep-update" /></CardContent>
        </GlassCard>
        {monitor && (
          <GlassCard interactive={false} className="lg:col-span-2">
            <CardHeader className="pb-1"><CardTitle className="text-sm font-bold">Acknowledgement rate by department (%)</CardTitle></CardHeader>
            <CardContent><BarsChart data={d.compliance} suffix="%" max={100} emptyLabel="Nothing has been assigned yet." /></CardContent>
          </GlassCard>
        )}
      </div>

      <GlassCard interactive={false}>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-bold">Department coverage</CardTitle>
          <CardDescription className="text-xs">SOPs per department by status</CardDescription>
        </CardHeader>
        <CardContent className="max-h-96 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                {statuses.map((s) => <TableHead key={s.value} className="text-right">{s.label}</TableHead>)}
                <TableHead className="text-right">Total</TableHead>
                {comp && <TableHead>Ack rate</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No SOPs yet.</TableCell></TableRow>}
              {matrix.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link href={`/playbook-ai/library?department=${r.id}`} className="font-medium hover:underline">{r.name}</Link></TableCell>
                  {statuses.map((s) => <TableCell key={s.value} className="text-right tabular-nums text-muted-foreground">{r.byStatus[s.value] || "·"}</TableCell>)}
                  <TableCell className="text-right font-medium tabular-nums">{r.total}</TableCell>
                  {comp && <TableCell><RateBar rate={comp.byDepartment.find((x) => x.departmentId === r.id)?.rate ?? null} /></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </GlassCard>

      {canExport && (
        <GlassCard interactive={false}>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-sm font-bold"><FileSpreadsheet className="size-4" />Exports</CardTitle>
            <CardDescription className="text-xs">CSV opens anywhere; Excel adds formatting. Every export is recorded in the audit log.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {REPORTS.filter((r) => !r.needsCompliance || monitor).map((r) => (
              <div key={r.type} className="flex flex-col gap-2 rounded-xl border border-border/50 p-3">
                <div>
                  <p className="text-sm font-semibold">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                </div>
                <div className="flex gap-2">
                  <a href={`/api/playbook-ai/export/${r.type}?format=csv`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download className="size-3.5" data-icon="inline-start" />CSV</a>
                  <a href={`/api/playbook-ai/export/${r.type}?format=xlsx`} className={buttonVariants({ variant: "outline", size: "sm" })}><Download className="size-3.5" data-icon="inline-start" />Excel</a>
                </div>
              </div>
            ))}
          </CardContent>
        </GlassCard>
      )}
</PanelListFilters>
    </div>
  );
}
