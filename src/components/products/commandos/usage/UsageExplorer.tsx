"use client";

import "./usage-viz.css";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, Download, Globe, Info, Search, TableProperties, TrendingUp, User, Users, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { METRICS, USAGE_METRIC_KEYS, type Level, type MetricDetail, type MetricOverview, type PeopleUsage, type PersonDetail, type UsageEventRow, type UsageMetricKey, type UsageOverview } from "@/lib/platform/billing/usage-history-shared";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const nf = (n: number, dp = 2) => n.toLocaleString("en-IN", { maximumFractionDigits: dp });
const fmtValue = (key: UsageMetricKey, n: number) => (key === "ai" || key === "emails" || key === "seats" || key === "domains" ? nf(n, 0) : nf(n, 2));
const LEVEL: Record<Level, { label: string; bar: string; chip: string; icon: typeof CheckCircle2 }> = {
  ok: { label: "Within limit", bar: "bg-[var(--viz-1)]", chip: "text-emerald-700 dark:text-emerald-400 border-emerald-500/40", icon: CheckCircle2 },
  near: { label: "Close to the limit", bar: "bg-[var(--viz-warn)]", chip: "text-amber-700 dark:text-amber-400 border-amber-500/50", icon: AlertTriangle },
  over: { label: "Limit reached", bar: "bg-[var(--viz-bad)]", chip: "text-red-700 dark:text-red-400 border-red-500/50", icon: XCircle },
};

// ── overview cards ──────────────────────────────────────────────────────────

export function OverviewCards({ overview, selected, period }: { overview: UsageOverview; selected: UsageMetricKey; period: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="list" aria-label="Usage against your plan">
      {overview.metrics.map((m) => (
        <MeterCard key={m.key} m={m} active={m.key === selected} href={`/commandos/settings/usage?metric=${m.key}${period !== overview.period.key ? `&period=${period}` : ""}#details`} resetsOn={overview.period.resetsOn} />
      ))}
    </div>
  );
}

function MeterCard({ m, active, href, resetsOn }: { m: MetricOverview; active: boolean; href: string; resetsOn: string }) {
  const meta = METRICS[m.key];
  const lv = LEVEL[m.level];
  const Icon = lv.icon;
  return (
    <Link href={href} scroll={false} role="listitem" aria-current={active ? "true" : undefined} data-level={m.level} className={`usage-viz block rounded-2xl border p-4 transition-colors hover:border-primary/50 ${active ? "border-primary bg-primary/5" : "border-border/70 bg-card"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{m.label}</p>
        <Badge variant="outline" className={`gap-1 text-[10px] ${lv.chip}`}><Icon className="size-3" />{lv.label}</Badge>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {fmtValue(m.key, m.used)}
        <span className="ml-1 text-sm font-normal text-muted-foreground">/ {m.limit === null ? "Unlimited" : fmtValue(m.key, m.limit)} {m.unit}</span>
      </p>
      {m.limit !== null && (
        <div role="progressbar" aria-label={`${m.label} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.percent} className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${lv.bar}`} style={{ width: `${m.percent}%` }} />
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {m.limit === null ? "No limit on your plan." : m.limit === 0 ? "Not included in your plan." : m.key === "seats" && m.limit === 1 ? "Your plan is for one person. Upgrade to add your team." : `${m.percent}% used · ${fmtValue(m.key, m.remaining ?? 0)} ${m.unit} left`}
        {meta.kind === "monthly" && m.limit !== null && m.limit > 0 ? ` · resets ${resetsOn}` : ""}
      </p>
      {m.projected !== null && m.limit !== null && m.limit > 0 && (
        <p className={`mt-1.5 flex items-start gap-1 text-xs ${m.willRunOut ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
          <TrendingUp className="mt-0.5 size-3 shrink-0" />
          {m.willRunOut ? `At this pace you'll use about ${fmtValue(m.key, m.projected)} ${m.unit} (${m.projectedPercent}%) — more than your plan.` : `At this pace: about ${fmtValue(m.key, m.projected)} ${m.unit} by month end (${m.projectedPercent}%).`}
        </p>
      )}
    </Link>
  );
}

// ── detail ──────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, unit, kind }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string; unit: string; kind: UsageMetricKey }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.filter((p) => typeof p.value === "number").map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 tabular-nums">
          <span className="inline-block size-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="font-semibold">{fmtValue(kind, p.value as number)} {unit}</span>
        </p>
      ))}
    </div>
  );
}

const axis = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

function Panel({ title, hint, children, actions }: { title: string; hint?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function ChartOrTable({ rows, unit, kind, render, label }: { rows: { label: string; value: number }[]; unit: string; kind: UsageMetricKey; render: React.ReactNode; label: string }) {
  const [table, setTable] = useState(false);
  return (
    <div>
      <div className="mb-1 flex justify-end">
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" aria-pressed={table} onClick={() => setTable((t) => !t)}>
          <TableProperties className="size-3.5" />{table ? "Show chart" : "View as table"}
        </Button>
      </div>
      {table ? (
        <div className="max-h-64 overflow-auto rounded-lg border border-border/60">
          <table className="w-full text-xs">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-muted/60 text-left"><tr><th className="px-3 py-1.5">Date</th><th className="px-3 py-1.5 text-right">{unit}</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.label} className="border-t border-border/40"><td className="px-3 py-1">{r.label}</td><td className="px-3 py-1 text-right tabular-nums">{fmtValue(kind, r.value)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : render}
    </div>
  );
}

export function DetailView({ detail, overview }: { detail: MetricDetail; overview: UsageOverview }) {
  const meta = METRICS[detail.key];
  const m = overview.metrics.find((x) => x.key === detail.key)!;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const monthly = meta.kind === "monthly";
  const signed = detail.key === "storage";
  const hasData = detail.daily.some((p) => p.value !== 0) || detail.total > 0;

  const go = (next: { metric?: string; period?: string }) => {
    const sp = new URLSearchParams(params.toString());
    if (next.metric) sp.set("metric", next.metric);
    if (next.period) sp.set("period", next.period);
    router.push(`${pathname}?${sp.toString()}#details`, { scroll: false });
  };

  // Cumulative line (+ the pace line to month end for the current month of a monthly meter).
  const cumulative = useMemo(() => {
    const rows: { label: string; used: number | null; pace: number | null }[] = detail.cumulative.map((p) => ({ label: p.label, used: p.value, pace: null }));
    if (monthly && detail.isCurrentPeriod && m.projected !== null && rows.length > 0) {
      const lastIdx = rows.length - 1;
      const start = rows[lastIdx].used ?? 0;
      const remainingDays = overview.period.daysTotal - rows.length;
      rows[lastIdx].pace = start;
      for (let i = 1; i <= remainingDays; i++) {
        const t = new Date(`${detail.cumulative[lastIdx].date}T00:00:00Z`);
        t.setUTCDate(t.getUTCDate() + i);
        rows.push({ label: t.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }), used: null, pace: round2(start + ((m.projected - start) * i) / remainingDays) });
      }
    }
    return rows;
  }, [detail, monthly, m.projected, overview.period.daysTotal]);

  const lv = LEVEL[m.level];
  const note =
    m.level === "over" ? `${meta.atLimit}` : m.level === "near" ? `You are close to your limit. ${meta.atLimit.replace(/^[A-Z]/, (c) => c.toLowerCase())}` : null;

  return (
    <div id="details" className="usage-viz scroll-mt-24 space-y-4">
      {/* Selector row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border/70 bg-card p-1" role="tablist" aria-label="Meter">
          {USAGE_METRIC_KEYS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={k === detail.key} onClick={() => go({ metric: k })} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${k === detail.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {METRICS[k].short}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select items={Object.fromEntries(detail.periods.map((p) => [p.key, p.label]))} value={detail.period} onValueChange={(v: string | null) => v && go({ period: v })}>
            <SelectTrigger className="h-8 w-44 text-xs" aria-label="Month"><SelectValue /></SelectTrigger>
            <SelectContent align="end">{detail.periods.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}{p.key === overview.period.key ? " (this month)" : ""}</SelectItem>)}</SelectContent>
          </Select>
          <a href={`/api/commandos/usage/export?metric=${detail.key}&period=${detail.period}`} className={`${buttonVariants({ variant: "outline", size: "sm" })} h-8 gap-1 text-xs`}><Download className="size-3.5" />Download CSV</a>
        </div>
      </div>

      {note && (
        <div role="status" className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${m.level === "over" ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
          <lv.icon className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{lv.label} — {m.label}</p>
            <p className="text-muted-foreground">{note} {meta.fix} <Link href="/commandos/settings/billing" className="font-medium text-primary underline">Change plan</Link></p>
          </div>
        </div>
      )}

      {/* Headline numbers */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={monthly ? `Used in ${detail.periodLabel}` : `Held at the end of ${detail.periodLabel}`} value={`${fmtValue(detail.key, detail.total)} ${detail.unit}`} sub={detail.limit === null ? "No limit on your plan" : detail.limit === 0 ? "Not included in your plan" : `of ${fmtValue(detail.key, detail.limit)} ${detail.unit} (${Math.min(100, Math.round((detail.total / detail.limit) * 100))}%)`} />
        <Stat label={monthly ? "Average per day" : "Average change per day"} value={`${fmtValue(detail.key, detail.averagePerDay)} ${detail.unit}`} sub={detail.peak ? `Busiest day: ${detail.peak.date} (${fmtValue(detail.key, detail.peak.value)})` : "No activity yet"} />
        <Stat label={detail.key === "ai" ? "AI requests" : detail.key === "seats" ? "People listed" : detail.key === "domains" ? "Domains" : "Recorded events"} value={nf(detail.calls, 0)} sub={detail.key === "ai" ? `${nf(detail.inputTokens, 0)} read · ${nf(detail.outputTokens, 0)} written` : detail.isCurrentPeriod ? "this month so far" : detail.periodLabel} />
        <Stat label={monthly ? "Resets" : "Limit applies"} value={monthly ? overview.period.resetsOn : "Always"} sub={monthly ? `${overview.period.daysLeft} day${overview.period.daysLeft === 1 ? "" : "s"} left in this month` : "What you hold right now, not per month"} />
      </div>

      {!hasData && (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card p-8 text-center text-sm text-muted-foreground">
          <Info className="mx-auto mb-2 size-5" />Nothing recorded for {meta.label.toLowerCase()} in {detail.periodLabel}.
        </div>
      )}

      {hasData && detail.daily.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title={signed ? "Files added and removed each day" : monthly ? `${meta.label} each day` : "People joining each day"} hint={`${detail.periodLabel}, in ${detail.unit}${signed ? " (removed files shown in orange)" : ""}`}>
            <ChartOrTable rows={detail.daily.map((p) => ({ label: p.label, value: p.value }))} unit={detail.unit} kind={detail.key} label="Daily values" render={
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={detail.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={22} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => compact.format(v)} />
                  <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltip unit={detail.unit} kind={detail.key} />} />
                  <Bar dataKey="value" name={signed ? "Net change" : meta.label} radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {detail.daily.map((p) => <Cell key={p.date} fill={p.value < 0 ? "var(--viz-2)" : "var(--viz-1)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            } />
          </Panel>

          <Panel title={signed ? "Storage held, day by day" : monthly ? "Running total against your limit" : "People over the month"} hint={monthly ? "How much of the allowance is gone, and where this month is heading" : "Compared with your plan's limit"}>
            <ChartOrTable rows={detail.cumulative.map((p) => ({ label: p.label, value: p.value }))} unit={detail.unit} kind={detail.key} label="Running total" render={
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={cumulative} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={22} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => compact.format(v)} domain={[0, (max: number) => Math.max(max, detail.limit && detail.limit > 0 ? detail.limit * 1.05 : 1)]} />
                  <Tooltip content={<ChartTooltip unit={detail.unit} kind={detail.key} />} />
                  {detail.limit !== null && detail.limit > 0 && <ReferenceLine y={detail.limit} stroke="var(--viz-bad)" strokeDasharray="5 4" label={{ value: `Plan limit ${fmtValue(detail.key, detail.limit)}`, position: "insideTopLeft", fontSize: 11, fill: "var(--foreground)" }} />}
                  <Line type="monotone" dataKey="used" name={signed ? "Held" : "Used so far"} stroke="var(--viz-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} connectNulls={false} />
                  {cumulative.some((r) => r.pace !== null) && <Line type="monotone" dataKey="pace" name="At this pace" stroke="var(--viz-2)" strokeWidth={2.5} strokeDasharray="5 4" dot={false} connectNulls />}
                </LineChart>
              </ResponsiveContainer>
            } />
            {cumulative.some((r) => r.pace !== null) && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium" style={{ color: "var(--viz-2)" }}>Dotted:</span> where the month ends if you keep using it at today's pace.</p>}
          </Panel>
        </div>
      )}

      {detail.months.length > 0 && (
        <Panel title={monthly ? "Last 12 months" : "Last 12 months, at month end"} hint={monthly ? "Total used each month — the allowance resets on the 1st" : "What was held at the end of each month"}>
          <ChartOrTable rows={detail.months.map((r) => ({ label: r.label, value: r.value }))} unit={detail.unit} kind={detail.key} label="Monthly history" render={
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={detail.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={6}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
                <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => compact.format(v)} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltip unit={detail.unit} kind={detail.key} />} />
                {detail.limit !== null && detail.limit > 0 && <ReferenceLine y={detail.limit} stroke="var(--viz-bad)" strokeDasharray="5 4" label={{ value: "Plan limit", position: "insideTopLeft", fontSize: 11, fill: "var(--foreground)" }} />}
                <Bar dataKey="value" name={meta.label} radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {detail.months.map((r) => <Cell key={r.period} fill={r.period === detail.period ? "var(--viz-1)" : "var(--viz-1-soft)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          } />
          <p className="mt-1 text-xs text-muted-foreground">The selected month is the solid bar.</p>
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {detail.bySource.length > 0 && (
          <Panel title={detail.key === "ai" ? "Which features used the tokens" : detail.key === "storage" ? "What was uploaded" : "What it was used for"} hint={`Share of ${detail.periodLabel}`}>
            <ul className="space-y-2">
              {detail.bySource.slice(0, 12).map((r) => (
                <li key={r.source} className="text-xs">
                  <div className="mb-0.5 flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{r.source}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground"><span className="font-semibold text-foreground">{fmtValue(detail.key, r.value)}</span> {detail.unit} · {r.share}% · {nf(r.count, 0)}×</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(2, r.share)}%` }} /></div>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {detail.byPerson.length > 0 && (
          <Panel title="Who used it" hint={`${detail.periodLabel} — open a person to see everything they used`}>
            <ul className="space-y-2">
              {detail.byPerson.slice(0, 12).map((r) => (
                <li key={r.key} className="text-xs">
                  <div className="mb-0.5 flex items-baseline justify-between gap-2">
                    <Link href={`/commandos/settings/usage?metric=${detail.key}&period=${detail.period}&person=${encodeURIComponent(r.key)}#person`} scroll={false} className="flex min-w-0 items-center gap-1.5 font-medium hover:underline"><ActorIcon kind={r.kind} /><span className="truncate">{r.label}</span></Link>
                    <span className="shrink-0 tabular-nums text-muted-foreground"><span className="font-semibold text-foreground">{fmtValue(detail.key, r.value)}</span> {detail.unit} · {r.share}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(2, r.share)}%` }} /></div>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {detail.key === "ai" && detail.byModel.length > 0 && (
          <Panel title="Models and token split" hint="Reading your request (input) and writing the reply (output) both count">
            <div className="mb-3">
              <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${nf(detail.inputTokens, 0)} input tokens and ${nf(detail.outputTokens, 0)} output tokens`}>
                <div className="h-full bg-[var(--viz-1)]" style={{ width: `${pct(detail.inputTokens, detail.inputTokens + detail.outputTokens)}%` }} />
                <div className="ml-0.5 h-full bg-[var(--viz-2)]" style={{ width: `${pct(detail.outputTokens, detail.inputTokens + detail.outputTokens)}%` }} />
              </div>
              <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><i className="inline-block size-2 rounded-sm bg-[var(--viz-1)]" />Input (read) {nf(detail.inputTokens, 0)}</span>
                <span className="inline-flex items-center gap-1"><i className="inline-block size-2 rounded-sm bg-[var(--viz-2)]" />Output (written) {nf(detail.outputTokens, 0)}</span>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Model</th><th className="py-1 text-right font-medium">Requests</th><th className="py-1 text-right font-medium">Input</th><th className="py-1 text-right font-medium">Output</th><th className="py-1 text-right font-medium">Total</th></tr></thead>
              <tbody>{detail.byModel.map((r) => <tr key={r.model} className="border-t border-border/40 tabular-nums"><td className="py-1 font-medium">{r.model}</td><td className="py-1 text-right">{nf(r.calls, 0)}</td><td className="py-1 text-right">{nf(r.inputTokens, 0)}</td><td className="py-1 text-right">{nf(r.outputTokens, 0)}</td><td className="py-1 text-right font-semibold">{nf(r.value, 0)}</td></tr>)}</tbody>
            </table>
          </Panel>
        )}

        {detail.key === "seats" && <PeopleTable detail={detail} />}
        {detail.key === "domains" && <DomainsTable detail={detail} />}
      </div>

      {detail.historyNote && (
        <p className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" />{detail.historyNote}</p>
      )}

      <EventLog detail={detail} />

      <Panel title="How this meter works">
        <dl className="grid gap-3 text-xs sm:grid-cols-3">
          <div><dt className="font-semibold">What counts</dt><dd className="mt-0.5 text-muted-foreground">{meta.counts}</dd></div>
          <div><dt className="font-semibold">When the limit is reached</dt><dd className="mt-0.5 text-muted-foreground">{meta.atLimit}</dd></div>
          <div><dt className="font-semibold">What you can do</dt><dd className="mt-0.5 text-muted-foreground">{meta.fix}{meta.provider ? ` Used through ${meta.provider}.` : ""}</dd></div>
        </dl>
      </Panel>
    </div>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, total: number) => (total > 0 ? Math.max(1, Math.round((a / total) * 100)) : 0);

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function PeopleTable({ detail }: { detail: MetricDetail }) {
  return (
    <Panel title="Who holds a seat" hint="Active accounts and invitations waiting to be accepted">
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Person</th><th className="py-1 font-medium">Access</th><th className="py-1 font-medium">Joined</th><th className="py-1 font-medium">Status</th></tr></thead>
          <tbody>{detail.people.map((p) => <tr key={`${p.email}-${p.status}`} className="border-t border-border/40"><td className="py-1.5 font-medium">{p.email}</td><td className="py-1.5 text-muted-foreground">{p.roles || "—"}</td><td className="py-1.5">{p.joined}</td><td className="py-1.5"><Badge variant="outline" className="text-[10px]">{p.status === "pending" ? "Invited" : p.lastLogin ? `Active · last sign-in ${p.lastLogin}` : "Active"}</Badge></td></tr>)}</tbody>
        </table>
      </div>
    </Panel>
  );
}

function DomainsTable({ detail }: { detail: MetricDetail }) {
  return (
    <Panel title="Connected domains" hint="Your own domains (the address that comes with your workspace is free)">
      {detail.domains.length === 0 ? <p className="text-xs text-muted-foreground">No custom domain connected yet.</p> : (
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Domain</th><th className="py-1 font-medium">Added</th><th className="py-1 font-medium">Status</th></tr></thead>
          <tbody>{detail.domains.map((d) => <tr key={d.host} className="border-t border-border/40"><td className="py-1.5 font-medium">{d.host}{d.primary && <Badge variant="secondary" className="ml-2 text-[10px]">Primary</Badge>}</td><td className="py-1.5">{d.added}</td><td className="py-1.5">{d.status}</td></tr>)}</tbody>
        </table>
      )}
    </Panel>
  );
}

function EventLog({ detail }: { detail: MetricDetail }) {
  const [source, setSource] = useState("all");
  const [person, setPerson] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const ai = detail.key === "ai";
  const sources = useMemo(() => [...new Set(detail.events.map((e) => e.source))].sort(), [detail.events]);
  const people = useMemo(() => [...new Map(detail.events.filter((e) => e.byKey).map((e) => [e.byKey as string, e.by as string])).entries()], [detail.events]);
  const rows = useMemo(() => detail.events.filter((e) => (source === "all" || e.source === source) && (person === "all" || e.byKey === person) && (!q.trim() || `${e.source} ${e.detail} ${e.by ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [detail.events, source, person, q]);
  const PAGE = 25;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const slice = rows.slice((Math.min(page, pages) - 1) * PAGE, Math.min(page, pages) * PAGE);
  const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <Panel title="Every use, newest first" hint={detail.events.length === 0 ? "Nothing recorded in this month" : `${nf(rows.length, 0)} of ${nf(detail.events.length, 0)} shown${detail.eventsTruncated ? " — the latest only; download the CSV for the full list" : ""}`}
      actions={detail.events.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search…" className="h-8 w-40 text-xs" aria-label="Search the history" />
          {people.length > 1 && (
            <Select items={{ all: "Everyone", ...Object.fromEntries(people) }} value={person} onValueChange={(v: string | null) => { if (v) { setPerson(v); setPage(1); } }}>
              <SelectTrigger className="h-8 w-52 text-xs" aria-label="Filter by person"><SelectValue /></SelectTrigger>
              <SelectContent align="end"><SelectItem value="all">Everyone</SelectItem>{people.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select items={{ all: "All sources", ...Object.fromEntries(sources.map((x) => [x, x])) }} value={source} onValueChange={(v: string | null) => { if (v) { setSource(v); setPage(1); } }}>
            <SelectTrigger className="h-8 w-48 text-xs" aria-label="Filter by source"><SelectValue /></SelectTrigger>
            <SelectContent align="end"><SelectItem value="all">All sources</SelectItem>{sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}>
      {detail.events.length === 0 ? <p className="text-xs text-muted-foreground">When something uses this meter it shows up here, with the time and what it was for.</p> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3 font-medium">When</th><th className="py-1 pr-3 font-medium">{detail.key === "seats" || detail.key === "domains" ? "What" : "Used for"}</th><th className="py-1 pr-3 font-medium">By</th><th className="py-1 pr-3 font-medium">Detail</th>{ai && <th className="py-1 pr-3 text-right font-medium">Read</th>}{ai && <th className="py-1 pr-3 text-right font-medium">Written</th>}<th className="py-1 text-right font-medium">{ai ? "Tokens" : detail.unit}</th></tr></thead>
              <tbody>{slice.map((e: UsageEventRow, i) => (
                <tr key={`${e.at}-${i}`} className="border-t border-border/40 align-top">
                  <td suppressHydrationWarning className="whitespace-nowrap py-1.5 pr-3 text-muted-foreground">{when(e.at)}</td>
                  <td className="py-1.5 pr-3 font-medium">{e.source}{e.estimated && <Badge variant="outline" className="ml-1.5 text-[9px]" title="The provider didn't report exact tokens for this request, so an estimate was counted">estimated</Badge>}</td>
                  <td className="max-w-[14rem] truncate py-1.5 pr-3" title={e.by}>{e.byKey ? <Link href={`/commandos/settings/usage?metric=${detail.key}&period=${detail.period}&person=${encodeURIComponent(e.byKey)}#person`} scroll={false} className="hover:underline">{e.by}</Link> : "—"}</td>
                  <td className="max-w-xs truncate py-1.5 pr-3 text-muted-foreground" title={e.detail}>{e.detail || "—"}</td>
                  {ai && <td className="py-1.5 pr-3 text-right tabular-nums">{nf(e.inputTokens ?? 0, 0)}</td>}
                  {ai && <td className="py-1.5 pr-3 text-right tabular-nums">{nf(e.outputTokens ?? 0, 0)}</td>}
                  <td className={`py-1.5 text-right font-semibold tabular-nums ${e.value < 0 ? "text-[var(--viz-2)]" : ""}`}>{e.value > 0 && detail.key === "storage" ? "+" : ""}{fmtValue(detail.key, e.value)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Page {Math.min(page, pages)} of {pages}</span>
              <div className="flex gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button type="button" variant="outline" size="sm" className="h-7" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}


// ── people ──────────────────────────────────────────────────────────────────

function ActorIcon({ kind }: { kind: string }) {
  const Icon = kind === "visitor" ? Globe : kind === "system" ? Bot : kind === "portal" ? User : kind === "user" ? User : Info;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />;
}

const KIND_LABEL: Record<string, string> = { user: "Team member", portal: "Portal user", visitor: "Website visitors", system: "Automatic", unknown: "Not recorded" };

type SortKey = "ai" | "emails" | "voiceMinutes" | "storageMb" | "label";

/** Every person's use of every meter this month, side by side. Each row opens that person's own page. */
export function PeoplePanel({ people, metric }: { people: PeopleUsage; metric: UsageMetricKey }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("ai");
  const rows = useMemo(() => {
    const list = people.rows.filter((r) => !q.trim() || `${r.label} ${r.topFeature ?? ""} ${KIND_LABEL[r.kind] ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
    return [...list].sort((a, b) => (sort === "label" ? a.label.localeCompare(b.label) : (b[sort] as number) - (a[sort] as number)));
  }, [people.rows, q, sort]);
  const th = (key: SortKey, label: string, right = true) => (
    <th className={`py-1.5 pr-3 font-medium ${right ? "text-right" : ""}`} aria-sort={sort === key ? "descending" : "none"}>
      <button type="button" onClick={() => setSort(key)} className={`hover:text-foreground ${sort === key ? "text-foreground underline underline-offset-2" : ""}`}>{label}</button>
    </th>
  );
  return (
    <section id="people" className="usage-viz scroll-mt-24 rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Users className="size-4" />Who is using what — {people.periodLabel}</h2>
          <p className="text-xs text-muted-foreground">Every person's use of every meter this month. Click a name to see exactly what they used and when. Website visitors are grouped, never identified.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person…" className="h-8 w-48 pl-7 text-xs" aria-label="Find a person" /></div>
          <a href={`/api/commandos/usage/export?metric=people&period=${people.period}`} className={`${buttonVariants({ variant: "outline", size: "sm" })} h-8 gap-1 text-xs`}><Download className="size-3.5" />Download CSV</a>
        </div>
      </div>
      {people.rows.length === 0 ? <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">Nobody has used AI, email, voice or uploads in {people.periodLabel} yet. Each person's use will be listed here as it happens.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <caption className="sr-only">Use of each meter by person</caption>
            <thead><tr className="text-left text-muted-foreground">{th("label", "Person", false)}{th("ai", "AI tokens")}<th className="py-1.5 pr-3 font-medium">Share of AI</th><th className="py-1.5 pr-3 font-medium">Mostly used for</th>{th("emails", "Emails")}{th("voiceMinutes", "Voice min")}{th("storageMb", "Uploaded MB")}<th className="py-1.5 font-medium">Last active</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={`border-t border-border/40 align-middle tabular-nums ${r.key === "unknown" ? "text-muted-foreground" : ""}`}>
                  <td className="py-2 pr-3"><Link href={`/commandos/settings/usage?metric=${metric}&period=${people.period}&person=${encodeURIComponent(r.key)}#person`} scroll={false} className="flex items-center gap-1.5 font-medium hover:underline"><ActorIcon kind={r.kind} /><span className="max-w-[16rem] truncate">{r.label}</span><Badge variant="outline" className="text-[9px]">{KIND_LABEL[r.kind] ?? r.kind}</Badge></Link></td>
                  <td className="py-2 pr-3 text-right font-semibold">{nf(r.ai, 0)}<span className="ml-1 font-normal text-muted-foreground">({nf(r.aiCalls, 0)}×)</span></td>
                  <td className="py-2 pr-3"><div className="flex items-center gap-2"><div className="h-2 w-20 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${r.aiShare}% of the AI tokens`}><div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${r.ai > 0 ? Math.max(3, r.aiShare) : 0}%` }} /></div><span className="w-10 text-muted-foreground">{r.aiShare}%</span></div></td>
                  <td className="max-w-[10rem] truncate py-2 pr-3 text-muted-foreground" title={r.topFeature ?? ""}>{r.topFeature ?? "—"}</td>
                  <td className="py-2 pr-3 text-right">{nf(r.emails, 0)}</td>
                  <td className="py-2 pr-3 text-right">{nf(r.voiceMinutes, 2)}</td>
                  <td className="py-2 pr-3 text-right">{nf(r.storageMb, 2)}</td>
                  <td className="whitespace-nowrap py-2 text-muted-foreground" suppressHydrationWarning>{r.lastAt ? new Date(r.lastAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-border font-semibold tabular-nums"><td className="py-2 pr-3">Everyone</td><td className="py-2 pr-3 text-right">{nf(people.totals.ai, 0)}</td><td /><td /><td className="py-2 pr-3 text-right">{nf(people.totals.emails, 0)}</td><td className="py-2 pr-3 text-right">{nf(people.totals.voiceMinutes, 2)}</td><td className="py-2 pr-3 text-right">{nf(people.totals.storageMb, 2)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}
      {people.rows.some((r) => r.key === "unknown") && <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" />“{`Not recorded`}” is use from before per-person history began; it is in the totals but can't be traced to anyone.</p>}
    </section>
  );
}

/** One person's page: their share of every meter, what they used it for, how it moved day by day, and every single use. */
export function PersonView({ person, metric, backHref }: { person: PersonDetail; metric: UsageMetricKey; backHref: string }) {
  const [page, setPage] = useState(1);
  const PAGE = 25;
  const pages = Math.max(1, Math.ceil(person.events.length / PAGE));
  const slice = person.events.slice((Math.min(page, pages) - 1) * PAGE, Math.min(page, pages) * PAGE);
  const hasAi = person.meters[0].value > 0;
  return (
    <section id="person" className="usage-viz scroll-mt-24 space-y-4 rounded-2xl border border-primary/40 bg-primary/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={backHref} scroll={false} className="mb-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"><ArrowLeft className="size-3" />Back to everyone</Link>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><ActorIcon kind={person.kind} />{person.label}<Badge variant="outline" className="text-[10px]">{KIND_LABEL[person.kind] ?? person.kind}</Badge></h2>
          <p className="text-xs text-muted-foreground">Everything this {person.kind === "visitor" ? "group" : "person"} used in {person.periodLabel}.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {person.meters.map((m) => (
          <div key={m.key} className="rounded-xl border border-border/70 bg-card p-3">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{fmtValue(m.key, m.value)} <span className="text-xs font-normal text-muted-foreground">{m.unit}</span></p>
            {m.companyTotal > 0 ? <><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(m.value > 0 ? 3 : 0, m.share)}%` }} /></div><p className="mt-1 text-[11px] text-muted-foreground">{m.share}% of the workspace's {fmtValue(m.key, m.companyTotal)}</p></> : <p className="mt-1 text-[11px] text-muted-foreground">{m.key === "storage" ? "uploaded this month" : "no workspace total yet"}</p>}
          </div>
        ))}
      </div>

      {hasAi && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="AI tokens each day" hint={person.periodLabel}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={person.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={22} />
                <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => compact.format(v)} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltip unit="tokens" kind="ai" />} />
                <Bar dataKey="value" name="AI tokens" fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel title="Last 12 months of AI use" hint="Tokens per month">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={person.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={6}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
                <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => compact.format(v)} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltip unit="tokens" kind="ai" />} />
                <Bar dataKey="value" name="AI tokens" radius={[4, 4, 0, 0]} maxBarSize={40}>{person.months.map((r) => <Cell key={r.period} fill={r.period === person.period ? "var(--viz-1)" : "var(--viz-1-soft)"} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {person.bySource.length > 0 && (
          <Panel title="What they used the AI for">
            <ul className="space-y-2">{person.bySource.slice(0, 10).map((r) => (
              <li key={r.source} className="text-xs"><div className="mb-0.5 flex items-baseline justify-between gap-2"><span className="truncate font-medium">{r.source}</span><span className="shrink-0 tabular-nums text-muted-foreground"><span className="font-semibold text-foreground">{nf(r.value, 0)}</span> tokens · {r.share}% · {nf(r.count, 0)}×</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(2, r.share)}%` }} /></div></li>
            ))}</ul>
          </Panel>
        )}
        {person.byModel.length > 0 && (
          <Panel title="Models">
            <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="py-1 font-medium">Model</th><th className="py-1 text-right font-medium">Requests</th><th className="py-1 text-right font-medium">Read</th><th className="py-1 text-right font-medium">Written</th><th className="py-1 text-right font-medium">Total</th></tr></thead>
              <tbody>{person.byModel.map((r) => <tr key={r.model} className="border-t border-border/40 tabular-nums"><td className="py-1 font-medium">{r.model}</td><td className="py-1 text-right">{nf(r.calls, 0)}</td><td className="py-1 text-right">{nf(r.inputTokens, 0)}</td><td className="py-1 text-right">{nf(r.outputTokens, 0)}</td><td className="py-1 text-right font-semibold">{nf(r.value, 0)}</td></tr>)}</tbody></table>
          </Panel>
        )}
      </div>

      <Panel title="Every use by this person, newest first" hint={person.events.length === 0 ? "Nothing recorded this month" : `${nf(person.events.length, 0)} shown${person.eventsTruncated ? " (the latest only)" : ""}`}>
        {person.events.length === 0 ? <p className="text-xs text-muted-foreground">Nothing recorded for {person.label} in {person.periodLabel}.</p> : (
          <>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3 font-medium">When</th><th className="py-1 pr-3 font-medium">Used for</th><th className="py-1 pr-3 font-medium">Detail</th><th className="py-1 text-right font-medium">Amount</th></tr></thead>
              <tbody>{slice.map((e, i) => (
                <tr key={`${e.at}-${i}`} className="border-t border-border/40 align-top">
                  <td suppressHydrationWarning className="whitespace-nowrap py-1.5 pr-3 text-muted-foreground">{new Date(e.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-1.5 pr-3 font-medium">{e.source}{e.estimated && <Badge variant="outline" className="ml-1.5 text-[9px]">estimated</Badge>}</td>
                  <td className="max-w-sm truncate py-1.5 pr-3 text-muted-foreground" title={e.detail}>{e.detail || "—"}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{nf(e.value, 2)}</td>
                </tr>))}</tbody>
            </table></div>
            {pages > 1 && <div className="mt-3 flex items-center justify-between text-xs"><span className="text-muted-foreground">Page {Math.min(page, pages)} of {pages}</span><div className="flex gap-1.5"><Button type="button" variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button type="button" variant="outline" size="sm" className="h-7" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div></div>}
          </>
        )}
      </Panel>
      <p className="text-xs text-muted-foreground">Metric you came from: {METRICS[metric].label}. Amounts are tokens for AI, MB for files, emails, minutes for voice.</p>
    </section>
  );
}
