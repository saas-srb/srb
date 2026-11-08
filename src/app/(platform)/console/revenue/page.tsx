import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, BadgePercent, CalendarClock, Download, Gauge, IndianRupee, Receipt, ShieldAlert, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { getRevenueDashboard, monthKeyOf, AT_RISK_TRIAL_DAYS, RANGE_PRESETS, type AtRiskRow, type MixRow } from "@/lib/platform/billing/metrics";
import { formatMoney } from "@/lib/platform/billing/types";
import { cn } from "@/lib/utils";
import { BilledCollectedChart, EmptyChart, MovementsChart, MrrTrendChart, type ChartMonth } from "./RevenueCharts";
import FilterCardShell from "@/components/platform/panel/FilterCardShell";
import RevenueRangePicker from "./RevenueRangePicker";

export const metadata: Metadata = { title: "Revenue & subscriptions" };

// Fixed locale + fixed zone: the same text on every server, no hydration drift.
const IST_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
const IST_DATETIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(v !== 0 && Math.abs(v) < 0.1 ? 1 : 0)}%`);

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  grace: "Grace period",
  suspended: "Suspended",
  canceled: "Canceled",
};

const RISK_TONE: Record<AtRiskRow["status"], string> = {
  grace: "bg-destructive/15 text-destructive",
  past_due: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  trialing: "bg-muted text-muted-foreground",
};

type SearchParams = Promise<{ range?: string; from?: string; to?: string }>;

function MixList({ rows, testId, money }: { rows: MixRow[]; testId: string; money: (v: number) => string }) {
  return (
    <ul className="space-y-4" data-testid={testId}>
      {rows.map((p) => (
        <li key={p.id}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-medium">{p.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {money(p.mrr)} · {p.companies} {p.companies === 1 ? "company" : "companies"} · {pct(p.share)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${Math.max(p.share * 100, p.mrr > 0 ? 1 : 0)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function PlatformRevenuePage({ searchParams }: { searchParams: SearchParams }) {
  await requirePlatformPermission("revenue.read");
  const sp = await searchParams;
  const d = await getRevenueDashboard({ range: sp.range, from: sp.from, to: sp.to });
  const money = (v: number) => formatMoney(v, d.currency);
  const signedMoney = (v: number) => (v < 0 ? `−${money(-v)}` : money(v));
  const s = d.summary;
  const tc = d.trialConversion;

  const chart: ChartMonth[] = d.months.map((m) => ({
    label: m.label,
    mrr: m.mrr,
    new: m.new,
    expansion: m.expansion,
    contraction: m.contraction,
    churn: m.churn,
    net: m.net,
    billed: m.billed,
    invoicesIssued: m.invoicesIssued,
    collected: m.collected,
    collectedTax: m.collectedTax,
    invoicesPaid: m.invoicesPaid,
  }));
  const hasMrrHistory = d.months.some((m) => m.mrr > 0);
  const hasMovements = d.months.some((m) => m.new || m.expansion || m.contraction || m.churn);
  const hasCash = d.months.some((m) => m.collected > 0 || m.billed > 0);
  const brandNew = d.mrr === 0 && !hasMrrHistory && !hasCash && !hasMovements;
  const rangeQuery = new URLSearchParams(d.range.preset === "custom" ? { range: "custom", from: d.range.from, to: d.range.to } : { range: d.range.preset }).toString();

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Revenue & subscriptions"
        description="Recurring revenue, subscription movements and collections across every customer company (the platform owner is excluded)."
        actions={
          <div className="flex flex-wrap gap-2">
            <a
              href={`/console/revenue/export?${rangeQuery}`}
              id="revenue-export-months"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background px-3 text-sm font-medium hover:bg-muted/50"
            >
              <Download className="size-4" /> Export CSV
            </a>
            <a
              href="/console/revenue/export?kind=companies"
              id="revenue-export-companies"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background px-3 text-sm font-medium hover:bg-muted/50"
            >
              <Download className="size-4" /> Companies CSV
            </a>
          </div>
        }
      />

      {/* ── Now ── */}
      <section aria-labelledby="rev-now" className="space-y-3 rounded-3xl border border-border/50 bg-muted/70 p-5 sm:p-6 dark:border-border/40 dark:bg-transparent">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="rev-now" className="text-sm font-semibold">
            Right now
          </h2>
          <p className="text-xs text-muted-foreground" data-testid="revenue-as-of">
            As of {IST_DATETIME.format(new Date(d.generatedAt))} IST · MRR is pre-tax at catalogue prices; yearly plans count as ⅟₁₂ per month.
          </p>
        </div>
        <KpiGrid>
          <KpiCard label="MRR" value={money(d.mrr)} accent icon={<IndianRupee className="size-4" />} />
          <KpiCard label="ARR" value={money(d.arr)} icon={<TrendingUp className="size-4" />} />
          <KpiCard label="Paying companies" value={d.paying} icon={<Users className="size-4" />} />
          <KpiCard label="ARPA (monthly)" value={d.arpa === null ? "—" : money(d.arpa)} icon={<Gauge className="size-4" />} />
          <KpiCard label="On trial" value={d.counts.trialing} icon={<CalendarClock className="size-4" />} />
          <KpiCard label={`Trials ending (${AT_RISK_TRIAL_DAYS} days)`} value={d.trialsEndingSoon} icon={<CalendarClock className="size-4" />} />
          <KpiCard label="Past due" value={d.counts.past_due} icon={<AlertTriangle className="size-4" />} />
          <KpiCard label="In grace period" value={d.counts.grace} icon={<ShieldAlert className="size-4" />} />
        </KpiGrid>
      </section>

      {/* ── Range ── */}
      <section aria-labelledby="rev-range" className="space-y-3 rounded-3xl border border-border/50 bg-muted/70 p-5 sm:p-6 dark:border-border/40 dark:bg-transparent">
        <div className="flex flex-col gap-2">
          <h2 id="rev-range" className="text-sm font-semibold">
            <span data-testid="revenue-range-label">{d.range.label}</span>
            {d.range.preset !== "custom" && (
              <span className="font-normal text-muted-foreground">
                {" "}
                ({d.months[0]?.label} – {d.months[d.months.length - 1]?.label})
              </span>
            )}
          </h2>
          <FilterCardShell description="Pick the period the figures, charts and CSV export cover">
            <RevenueRangePicker presets={RANGE_PRESETS} preset={d.range.preset} from={d.range.from} to={d.range.to} maxMonth={monthKeyOf(new Date(d.generatedAt))} />
          </FilterCardShell>
        </div>
        <KpiGrid cols={6}>
          <KpiCard label="Net new MRR" value={signedMoney(s.net)} tone={s.net > 0 ? "up" : s.net < 0 ? "down" : undefined} icon={<ArrowUpRight className="size-4" />} />
          <KpiCard label="Trial → paid" value={pct(tc.rate)} icon={<BadgePercent className="size-4" />} />
          <KpiCard label="Logo churn" value={pct(s.logoChurnRate)} icon={<TrendingDown className="size-4" />} />
          <KpiCard label="Revenue churn" value={pct(s.revenueChurnRate)} icon={<TrendingDown className="size-4" />} />
          <KpiCard label="Collected (incl. GST)" value={money(s.collected)} icon={<Wallet className="size-4" />} />
          <KpiCard label="GST collected" value={money(s.collectedTax)} icon={<Receipt className="size-4" />} />
        </KpiGrid>
        <dl className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2" data-testid="revenue-range-notes">
          <div>
            <dt className="inline">MRR: </dt>
            <dd className="inline tabular-nums">
              {money(s.startMrr)} → {money(s.endMrr)} (new {money(s.new)}, expansion {money(s.expansion)}, contraction −{money(s.contraction)}, churn −{money(s.churn)})
            </dd>
          </div>
          <div data-testid="trial-conversion-note">
            <dt className="inline">Trial → paid: </dt>
            <dd className="inline">
              {tc.converted} of {tc.started - tc.open} ended trials converted{tc.open > 0 && `, ${tc.open} still running`}
              {tc.source === "current_state" ? " — estimated from current subscriptions (no trial history recorded)." : "."}
            </dd>
          </div>
          <div>
            <dt className="inline">Churn: </dt>
            <dd className="inline">
              {s.churnedLogos} of {s.payingAtStart} paying companies lost; net revenue churn {pct(s.netRevenueChurnRate)} (after expansion).
            </dd>
          </div>
          <div>
            <dt className="inline">Invoices: </dt>
            <dd className="inline tabular-nums">
              {s.invoicesIssued} issued for {money(s.billed)} ({money(s.billedTax)} GST) · {s.invoicesPaid} paid for {money(s.collected)}
              {s.collectionRate !== null && ` · ${pct(s.collectionRate)} collected`}
            </dd>
          </div>
        </dl>
      </section>

      {brandNew && (
        <GlassCard interactive={false} data-testid="revenue-empty">
          <CardContent className="flex flex-col gap-1 py-5">
            <p className="font-semibold">No revenue yet</p>
            <p className="text-sm text-muted-foreground">
              Nothing has been billed so far. MRR, movements and collections fill in here as soon as the first company moves from its trial to a paid plan.
              {d.counts.trialing > 0 && ` ${d.counts.trialing} ${d.counts.trialing === 1 ? "company is" : "companies are"} trialing right now.`}
            </p>
          </CardContent>
        </GlassCard>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">MRR over time</CardTitle>
            <CardDescription>Month-end monthly recurring revenue{d.range.includesCurrent ? "; the last point is today" : ""}.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasMrrHistory ? <MrrTrendChart data={chart} /> : <EmptyChart title="No recurring revenue yet">The trend starts with the first paid subscription.</EmptyChart>}
            {d.history.untrackedPaying > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {d.history.untrackedPaying} paying {d.history.untrackedPaying === 1 ? "company has" : "companies have"} no subscription history yet and{" "}
                {d.history.untrackedPaying === 1 ? "is" : "are"} shown flat from sign-up.
              </p>
            )}
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Net new MRR</CardTitle>
            <CardDescription>New and expansion above the line, contraction and churn below.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasMovements ? (
              <MovementsChart data={chart} />
            ) : (
              <EmptyChart title="No movements recorded">Upgrades, downgrades, new paid companies and cancellations appear here month by month.</EmptyChart>
            )}
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Billed vs collected</CardTitle>
            <CardDescription>SaaS invoices issued and payments received each month, including GST.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasCash ? <BilledCollectedChart data={chart} /> : <EmptyChart title="No invoices in this range">Issued and paid subscription invoices are totalled here by month.</EmptyChart>}
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Plan &amp; billing-cycle mix</CardTitle>
            <CardDescription>Share of today&apos;s MRR (paying companies only).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {d.planMix.length === 0 ? (
              <EmptyChart title="No paid plans yet">Each plan&apos;s share of revenue shows here once companies subscribe.</EmptyChart>
            ) : (
              <>
                <MixList rows={d.planMix} testId="plan-mix" money={money} />
                <div className="border-t border-border/60 pt-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Billing cycle</p>
                  <MixList rows={d.cycleMix} testId="cycle-mix" money={money} />
                </div>
              </>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground" data-testid="status-counts">
              {Object.entries(d.counts).map(([k, v]) => (
                <span key={k}>
                  {STATUS_LABEL[k]} <span className="font-semibold tabular-nums text-foreground">{v}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">At-risk subscriptions</CardTitle>
          <CardDescription>Failed payments (past due), grace periods, and trials ending within {AT_RISK_TRIAL_DAYS} days.</CardDescription>
        </CardHeader>
        <CardContent>
          {d.atRisk.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground" data-testid="at-risk-empty">
              Nothing at risk right now.
            </p>
          ) : (
            <ul className="divide-y divide-border/60" data-testid="at-risk">
              {d.atRisk.map((r) => (
                <li key={r.companyId} className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <Link href={`/console/companies/${r.companyId}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">{r.planName}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className={cn("rounded-full px-2 py-0.5 font-medium", RISK_TONE[r.status])}>{r.status === "trialing" ? "Trial ending" : STATUS_LABEL[r.status]}</span>
                    <span className="tabular-nums">{money(r.mrr)} MRR</span>
                    <span className="tabular-nums text-muted-foreground">{r.deadline ? IST_DATE.format(new Date(r.deadline)) : "—"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">By month</CardTitle>
          <CardDescription>The figures behind the charts. Churn rates compare with the start of each month.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[880px] text-sm" data-testid="revenue-months">
              <thead>
                <tr className="border-b border-border text-right text-xs text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-medium">Month</th>
                  <th className="py-2 pr-3 font-medium">MRR</th>
                  <th className="py-2 pr-3 font-medium">New</th>
                  <th className="py-2 pr-3 font-medium">Expansion</th>
                  <th className="py-2 pr-3 font-medium">Contraction</th>
                  <th className="py-2 pr-3 font-medium">Churn</th>
                  <th className="py-2 pr-3 font-medium">Net new</th>
                  <th className="py-2 pr-3 font-medium">Logo churn</th>
                  <th className="py-2 pr-3 font-medium">Revenue churn</th>
                  <th className="py-2 pr-3 font-medium">Trials</th>
                  <th className="py-2 pr-3 font-medium">Billed</th>
                  <th className="py-2 pr-3 font-medium">Collected</th>
                  <th className="py-2 font-medium">GST</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[...d.months].reverse().map((m) => (
                  <tr key={m.key} className="border-b border-border/50 text-right last:border-0">
                    <td className="py-2 pr-3 text-left whitespace-nowrap">{m.label}</td>
                    <td className="py-2 pr-3">{money(m.mrr)}</td>
                    <td className="py-2 pr-3">{money(m.new)}</td>
                    <td className="py-2 pr-3">{money(m.expansion)}</td>
                    <td className="py-2 pr-3">{m.contraction ? `−${money(m.contraction)}` : money(0)}</td>
                    <td className="py-2 pr-3">{m.churn ? `−${money(m.churn)}` : money(0)}</td>
                    <td className="py-2 pr-3 font-medium">{signedMoney(m.net)}</td>
                    <td className="py-2 pr-3">{pct(m.logoChurnRate)}</td>
                    <td className="py-2 pr-3">{pct(m.revenueChurnRate)}</td>
                    <td className="py-2 pr-3">{m.trialsStarted}</td>
                    <td className="py-2 pr-3">{money(m.billed)}</td>
                    <td className="py-2 pr-3">{money(m.collected)}</td>
                    <td className="py-2">{money(m.collectedTax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </GlassCard>
    </div>
  );
}
