import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, CheckCircle2, CircleDot, Clock3, Hourglass, Inbox, PlusCircle } from "lucide-react";
import DashboardSection from "@/components/platform/panel/DashboardSection";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import StatusPieChart from "@/components/products/dealflow-ai/StatusPieChart";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import StatusBadge, { PriorityBadge } from "@/components/support/StatusBadge";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { getCompanyCaller } from "@/lib/support/caller";
import { listPublished } from "@/lib/support/articles";
import { getSupportConfig, labelOf, stateOf, statusOf } from "@/lib/support/config";
import { companyDashboard } from "@/lib/support/requests";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PIE_COLORS = ["#E56043", "#1D428A", "#16a34a", "#f59e0b", "#8b5cf6", "#06b6d4", "#64748b"];

export default async function SupportDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const caller = await getCompanyCaller();
  if (!caller) redirect("/commandos/login");
  const sp = await searchParams;
  const [cfg, d, articles] = await Promise.all([getSupportConfig(), companyDashboard(caller.companyId, { from: sp.from, to: sp.to, type: sp.type, q: sp.q }), listPublished(6)]);
  const t = d.totals;
  const typeData = d.byType.map((x) => ({ label: labelOf(cfg.types, x.key), value: x.count }));
  const statusData = d.byStatus.map((x) => ({ status: x.key, label: statusOf(cfg, x.key)?.label ?? x.key, count: x.count }));
  const statusColors = Object.fromEntries(statusData.map((x, i) => [x.status, PIE_COLORS[i % PIE_COLORS.length]]));

  return (
    <div className="space-y-4">
      <PanelDashboardHeader
        title="Support Overview"
        description={`Track ${caller.companyName}'s support requests, see what needs your reply, and get instant help from the AI assistant.`}
        actions={
          <>
            <Link href="/resolveiq/assistant" className={buttonVariants({ variant: "outline", size: "sm" })}><Bot className="size-3.5" data-icon="inline-start" /> Ask the assistant</Link>
            <Link href="/resolveiq/requests/new" className={buttonVariants({ size: "sm" })}><PlusCircle className="size-3.5" data-icon="inline-start" /> New request</Link>
          </>
        }
        filters={
          <PanelFilterBar
            presets
            title="Search & Filters"
            description="Narrow the dashboard by date, request type or title"
            fields={[
              { key: "q", label: "Search", type: "search", placeholder: "Request title…" },
              { key: "type", label: "Type", type: "select", allLabel: "All types", options: cfg.types.map((x) => ({ value: x.key, label: x.label })) },
              { key: "from", label: "From", type: "date" },
              { key: "to", label: "To", type: "date" },
            ]}
          />
        }
      />

      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Requests at a glance</h2>
        <KpiGrid>
          <KpiCard label="Total requests" value={t.total} accent icon={<Inbox className="size-4" />} />
          <KpiCard label="Open" value={t.open} icon={<CircleDot className="size-4" />} />
          <KpiCard label="Waiting for you" value={t.waiting} icon={<Hourglass className="size-4" />} tone={t.waiting > 0 ? "down" : undefined} />
          <KpiCard label="Resolved / closed" value={t.resolved + t.closed} icon={<CheckCircle2 className="size-4" />} />
        </KpiGrid>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3.5" /> Average time to resolve: {t.avgResolutionHours === null ? "not enough data yet" : t.avgResolutionHours < 48 ? `${t.avgResolutionHours} hours` : `${Math.round((t.avgResolutionHours / 24) * 10) / 10} days`}</p>
      </DashboardSection>

      {d.needsYou.length > 0 && (
        <DashboardSection className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Needs your reply</h2>
          <div className="space-y-2">
            {d.needsYou.map((r) => (
              <Link key={r._id} href={`/resolveiq/requests/${r._id}`} className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm transition-colors hover:bg-amber-500/15">
                <Hourglass className="size-4 shrink-0 text-amber-600" />
                <span className="min-w-0 flex-1 truncate"><span className="font-semibold">#{r.number}</span> {r.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">Support team is waiting for your reply</span>
              </Link>
            ))}
          </div>
        </DashboardSection>
      )}

      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Trends</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <GlassCard className="lg:col-span-2">
            <CardHeader><CardTitle>Requests over time</CardTitle></CardHeader>
            <CardContent><TimeSeriesChart data={d.trend.map((x) => ({ date: x.date, count: x.count }))} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>By status</CardTitle></CardHeader>
            <CardContent><StatusPieChart data={statusData} colors={statusColors} /></CardContent>
          </GlassCard>
        </div>
        <GlassCard>
          <CardHeader><CardTitle>By request type</CardTitle></CardHeader>
          <CardContent>{typeData.length ? <CategoryBarChart data={typeData} /> : <p className="py-10 text-center text-sm text-muted-foreground">No requests in this range.</p>}</CardContent>
        </GlassCard>
      </DashboardSection>

      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Recent activity</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <GlassCard interactive={false} className="divide-y divide-border/50 overflow-hidden p-0 lg:col-span-2">
            {d.recent.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No requests yet. <Link href="/resolveiq/requests/new" className="text-primary hover:underline">Send your first one</Link>.</p>
            ) : (
              d.recent.map((r) => (
                <Link key={r._id} href={`/resolveiq/requests/${r._id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                  <span className="w-12 shrink-0 text-xs font-semibold text-muted-foreground">#{r.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{r.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{labelOf(cfg.types, r.type)} · updated {formatDateTime(r.updatedAt)}</span>
                  </span>
                  <PriorityBadge label={labelOf(cfg.priorities, r.priority)} />
                  <StatusBadge label={statusOf(cfg, r.status)?.label ?? r.status} state={stateOf(cfg, r.status)} />
                </Link>
              ))
            )}
          </GlassCard>
          <GlassCard interactive={false} className="p-4">
            <p className="text-sm font-semibold text-foreground">Popular guides</p>
            {articles.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No guides have been published yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {articles.map((a) => <li key={a.slug}><Link href={`/resolveiq/help/${a.slug}`} className="block truncate rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary">{a.title}</Link></li>)}
              </ul>
            )}
            <Link href="/resolveiq/help" className="mt-2 block text-xs font-medium text-primary hover:underline">Browse the Help Center →</Link>
          </GlassCard>
        </div>
      </DashboardSection>
    </div>
  );
}
