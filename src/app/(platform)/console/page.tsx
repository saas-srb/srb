import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Building2, CalendarClock, CalendarPlus, CircleCheck, CirclePause, Clock, CreditCard, Gauge, Hourglass, IndianRupee, ShieldAlert, Sparkles, Timer, TrendingUp } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { requirePlatformAccess } from "@/lib/platform/console/access";
import { getPlatformKpis } from "@/lib/platform/console/companies";
import { getSubscriptionSnapshot } from "@/lib/platform/console/overview";
import { formatMoney } from "@/lib/platform/billing/types";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function PlatformDashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requirePlatformAccess();
  const { denied } = await searchParams;
  const [kpis, subs] = await Promise.all([getPlatformKpis(), getSubscriptionSnapshot()]);
  const overdue = subs.counts.past_due + subs.counts.grace;

  return (
    <div className="space-y-6 p-1">
      <PanelDashboardHeader breadcrumbs={[{ label: "Platform", href: "/console" }, { label: "Dashboard" }]} title="Platform Overview" description="Monitor tenants, subscriptions and revenue across the platform, and see what needs your attention." />
      <PanelListFilters>
{denied && (
        <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Your platform role doesn&apos;t include access to that page. Ask a Platform Owner if you need it.
        </p>
      )}

      <KpiGrid cols={6}>
        <KpiCard label="Companies" value={kpis.total} icon={<Building2 className="size-4" />} />
        <KpiCard label="Active" value={kpis.active} icon={<CircleCheck className="size-4" />} />
        <KpiCard label="Suspended" value={kpis.suspended} icon={<CirclePause className="size-4" />} />
        <KpiCard label="New (7 days)" value={kpis.createdLast7Days} icon={<Sparkles className="size-4" />} />
        <KpiCard label="New (30 days)" value={kpis.createdLast30Days} icon={<CalendarPlus className="size-4" />} />
        <KpiCard label="Awaiting approval" value={kpis.pendingApprovals} icon={<Hourglass className="size-4" />} />
      </KpiGrid>

      <KpiGrid cols={4}>
        <KpiCard label="On trial" value={subs.counts.trialing} icon={<Timer className="size-4" />} />
        <KpiCard label="Paying" value={subs.counts.active} icon={<CreditCard className="size-4" />} />
        <KpiCard label="Payment overdue" value={overdue} icon={<AlertTriangle className="size-4" />} />
        <KpiCard label="Suspended / ended" value={subs.counts.suspended + subs.counts.canceled} icon={<Clock className="size-4" />} />
      </KpiGrid>

      <section aria-label="Revenue" className="space-y-2 rounded-3xl border border-border/50 bg-muted/70 p-5 sm:p-6 dark:border-border/40 dark:bg-transparent">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Revenue</h2>
          <Link href="/console/revenue" className="text-xs font-medium text-primary hover:underline" data-testid="dashboard-revenue-link">
            Revenue &amp; subscriptions →
          </Link>
        </div>
        <KpiGrid cols={6}>
          <KpiCard label="MRR" value={formatMoney(subs.mrr, subs.currency)} accent icon={<IndianRupee className="size-4" />} />
          <KpiCard label="ARR" value={formatMoney(subs.arr, subs.currency)} icon={<TrendingUp className="size-4" />} />
          <KpiCard label="ARPA (monthly)" value={subs.arpa === null ? "—" : formatMoney(subs.arpa, subs.currency)} icon={<Gauge className="size-4" />} />
          <KpiCard label="Trials ending (7 days)" value={subs.trialsEndingCount} icon={<CalendarClock className="size-4" />} />
          <KpiCard label="Past due" value={subs.counts.past_due} icon={<AlertTriangle className="size-4" />} />
          <KpiCard label="In grace period" value={subs.counts.grace} icon={<ShieldAlert className="size-4" />} />
        </KpiGrid>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Trials ending in 7 days</CardTitle>
            <CardDescription>Companies that haven&apos;t chosen a plan yet.</CardDescription>
          </CardHeader>
          <CardContent>
            {subs.trialsEndingSoon.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trials end in the next week.</p>
            ) : (
              <ul className="divide-y divide-border">
                {subs.trialsEndingSoon.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link href={`/console/companies/${t.id}`} className="truncate font-medium hover:underline">
                      {t.name}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                      {t.daysLeft <= 0 ? "ends today" : `${t.daysLeft} day${t.daysLeft === 1 ? "" : "s"} left`} · {formatDateTime(t.endsAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Needs attention</CardTitle>
            <CardDescription>Decisions and follow-ups waiting for the platform team.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Link href="/console/signups" className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/50">
              <span>Sign-ups awaiting approval</span>
              <span className="font-semibold">{kpis.pendingApprovals}</span>
            </Link>
            <Link href="/console/companies?status=suspended" className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/50">
              <span>Suspended companies</span>
              <span className="font-semibold">{kpis.suspended}</span>
            </Link>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span>Subscriptions with overdue payment</span>
              <span className="font-semibold">{overdue}</span>
            </div>
          </CardContent>
        </GlassCard>
      </div>
</PanelListFilters>
    </div>
  );
}
