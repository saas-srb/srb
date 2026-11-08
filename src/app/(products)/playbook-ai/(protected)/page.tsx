import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FileText,
  BookCheck,
  PencilLine,
  Zap,
  CalendarClock,
  AlarmClockOff,
  ShieldAlert,
  CheckCheck,
  Network,
  ClipboardCheck,
  Plus,
  ArrowRight,
} from "lucide-react";
import { CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiLink from "@/components/products/playbook-ai/KpiLink";
import { BarsChart, ColumnsChart, DonutChart, TrendChart } from "@/components/products/playbook-ai/SopCharts";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { getDashboard } from "@/lib/products/playbook-ai/analytics";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import { creatableDepartmentIds } from "@/lib/products/playbook-ai/access";
import { formatIsoDate } from "@/lib/products/playbook-ai/constants";

function ChartCard({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <GlassCard interactive={false} className={className}>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-bold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </GlassCard>
  );
}

export default async function SopDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tax = await getTaxonomy();
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const d = await getDashboard(viewer, { q: sp.q, departmentId: sp.departmentId });
  const k = d.kpis;
  const canCreate = creatableDepartmentIds(viewer)?.length !== 0;
  const needsAction = d.mine.pending + d.mine.overdue;

  return (
    <div className="space-y-4">
      <PanelDashboardHeader
        filters={<PanelFilterBar
          fields={[
            { key: "q", label: "Search", type: "search", placeholder: "Search SOPs by title or code…" },
            { key: "departmentId", label: "Department", type: "select", options: tax.departments.filter((d) => d.active).map((d) => ({ value: d._id, label: d.name })), allLabel: "All departments" },
          ]}
        />}
        breadcrumbs={[{ label: "SOP", href: "/playbook-ai" }, { label: "Dashboard" }]}
        title="Process Compliance Overview"
        description="Keep standard operating procedures current: track reviews, acknowledgements and expiring documents across departments."
        actions={
          canCreate && (
            <Link href="/playbook-ai/library/new" className={buttonVariants({ size: "sm" })}>
              <Plus className="size-3.5" data-icon="inline-start" />
              New SOP
            </Link>
          )
        }
      />

      {needsAction > 0 && (
        <Link
          href="/playbook-ai/assigned"
          className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm transition-colors hover:bg-primary/10"
        >
          <ClipboardCheck className="size-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-foreground">
              {needsAction} SOP{needsAction === 1 ? "" : "s"} waiting for your acknowledgement
            </span>
            {d.mine.overdue > 0 && <span className="ml-1 font-medium text-destructive">({d.mine.overdue} overdue)</span>}
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      <KpiGrid>
        <KpiLink href="/playbook-ai/library" label="Total SOPs" value={k.total} accent icon={<FileText className="size-4" />} />
        <KpiLink href="/playbook-ai/library?status=published,active" label="Published SOPs" value={k.published} icon={<BookCheck className="size-4" />} />
        <KpiLink href="/playbook-ai/library?status=draft" label="Draft SOPs" value={k.draft} icon={<PencilLine className="size-4" />} />
        <KpiLink href="/playbook-ai/library?status=active" label="Active SOPs" value={k.active} icon={<Zap className="size-4" />} />
        <KpiLink
          href="/playbook-ai/library?attention=expiring"
          label={`Expiring (${d.expiringSoonDays}d)`}
          value={k.expiring}
          tone={k.expiring > 0 ? "down" : undefined}
          icon={<CalendarClock className="size-4" />}
        />
        <KpiLink
          href="/playbook-ai/library?attention=overdue_review"
          label="Overdue Reviews"
          value={k.overdueReviews}
          tone={k.overdueReviews > 0 ? "down" : undefined}
          icon={<AlarmClockOff className="size-4" />}
        />
        <KpiLink href="/playbook-ai/library?attention=mandatory" label="Mandatory SOPs" value={k.mandatory} icon={<ShieldAlert className="size-4" />} />
        <KpiLink
          href={d.canSeeCompliance ? "/playbook-ai/compliance" : "/playbook-ai/assigned"}
          label="Acknowledgement Rate"
          value={k.ack.rate === null ? <span className="text-muted-foreground">No assignments</span> : <span>{k.ack.rate}%</span>}
          tone={k.ack.rate !== null && k.ack.rate < 60 ? "down" : k.ack.rate !== null && k.ack.rate >= 90 ? "up" : undefined}
          icon={<CheckCheck className="size-4" />}
        />
        <KpiLink
          href="/playbook-ai/departments"
          label="Department Coverage"
          value={<span>{k.coverage.covered}/{k.coverage.total} · {k.coverage.pct}%</span>}
          icon={<Network className="size-4" />}
        />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="SOPs by Department" description="Click a bar to filter the library">
          <BarsChart data={d.byDepartment} emptyLabel="No SOPs yet." />
        </ChartCard>
        <ChartCard title="SOP Status" description="Draft → Published → Active → Archived">
          <DonutChart data={d.byStatus} emptyLabel="No SOPs yet." />
        </ChartCard>
        <ChartCard title="SOP Categories">
          <BarsChart data={d.byCategory} emptyLabel="No SOPs yet." />
        </ChartCard>
        <ChartCard title="Acknowledgement" description={d.canSeeCompliance ? "Across everything you can monitor" : "Your own assignments"}>
          <DonutChart data={d.acknowledgement} emptyLabel="Nothing has been assigned yet." />
        </ChartCard>
        <ChartCard title="SOP Creation Trend" description="New SOPs per month, last 12 months">
          <TrendChart data={d.creationTrend} id="create" />
        </ChartCard>
        <ChartCard title="SOP Update Trend" description="New versions published per month">
          <TrendChart data={d.updateTrend} id="update" />
        </ChartCard>
        {d.canSeeCompliance && (
          <ChartCard title="Compliance by Department" description="Acknowledgement rate of the people in each department (%)">
            <BarsChart data={d.compliance} suffix="%" max={100} emptyLabel="Nothing has been assigned yet." />
          </ChartCard>
        )}
        <ChartCard title="Expiring SOPs" description="Expiry dates over the next six months">
          <ColumnsChart data={d.expiringByMonth} />
          {d.expiringList.length > 0 && (
            <ul className="mt-2 divide-y divide-border/40 text-sm">
              {d.expiringList.map((e) => (
                <li key={e.id}>
                  <Link href={`/playbook-ai/library/${e.id}`} className="flex items-center justify-between gap-3 py-1.5 hover:text-primary">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-xs text-muted-foreground">{e.code}</span>
                      {e.title}
                    </span>
                    <span className={`shrink-0 text-xs ${e.daysLeft <= 14 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                      {formatIsoDate(e.expiryDate)} · {e.daysLeft}d
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
