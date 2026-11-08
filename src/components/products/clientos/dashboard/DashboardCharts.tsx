"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import type { ChartDef } from "@/lib/products/clientos/dashboard/types";
import { compact, formatValue, rangeWindow, type RangeId } from "@/components/products/clientos/dashboard/format";
import Link from "next/link";

const COLORS = {
  primary: "var(--primary)",
  coral: "var(--color-brand-accent)",
  blue: "var(--color-brand-deep)",
  green: "#22c55e",
} as const;
const PALETTE = ["var(--primary)", "var(--color-brand-deep)", "var(--color-brand-accent)", "#22c55e", "#f59e0b", "#8b5cf6"];

const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--popover-foreground)" };
const axis = { fontSize: 11, fill: "var(--muted-foreground)" };

function Empty({ text }: { text: string }) {
  return <div className="flex h-28 items-center justify-center text-center text-sm text-muted-foreground">{text}</div>;
}

/** One chart card. Every chart, bar and slice is clickable and routes to the module it summarises. */
export default function ChartCard({ chart, range }: { chart: ChartDef; range: RangeId }) {
  const router = useRouter();
  const go = (href?: string) => href && router.push(href);
  const win = useMemo(() => rangeWindow(range), [range]);

  const { rows, compare } = useMemo(() => {
    if (!chart.series || !chart.rows) return { rows: [], compare: [] as { key: string; label: string; cur: number; pct: number | null }[] };
    const inWin = (d: string, lo: number | null, hi: number | null) => {
      const t = new Date(d).getTime();
      return (lo === null || t >= lo) && (hi === null || t < hi);
    };
    const current = chart.rows.filter((r) => inWin(r.date, win.from, null));
    const previous = win.from && win.prevFrom ? chart.rows.filter((r) => inWin(r.date, win.prevFrom, win.from)) : [];
    const cmp = chart.series.map((s) => {
      const cur = current.reduce((sum, r) => sum + Number(r[s.key] ?? 0), 0);
      const prev = previous.reduce((sum, r) => sum + Number(r[s.key] ?? 0), 0);
      return { key: s.key, label: s.label, cur, pct: win.from && prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null };
    });
    return { rows: current, compare: cmp };
  }, [chart, win]);

  const cats = chart.categories ?? [];
  const isEmpty = chart.series ? rows.length === 0 : cats.length === 0 || cats.every((c) => c.value === 0);

  return (
    <GlassCard interactive={false}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">{chart.title}</CardTitle>
          {chart.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{chart.subtitle}</p>}
        </div>
        {chart.href && (
          <Link href={chart.href} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary hover:underline">
            Details <ArrowUpRight className="size-3" />
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {compare.length > 0 && !isEmpty && (
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {compare.map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1 text-muted-foreground">
                <span className="font-semibold text-foreground">{formatValue(c.cur, chart.format)}</span> {c.label}
                {c.pct !== null && (
                  <span className={`inline-flex items-center gap-0.5 font-medium ${c.pct >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                    {c.pct >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    {Math.abs(c.pct)}%
                  </span>
                )}
              </span>
            ))}
            {win.from && <span className="text-muted-foreground/70">vs previous period</span>}
          </div>
        )}

        {isEmpty ? (
          <Empty text={chart.emptyText ?? "No data in this range."} />
        ) : chart.kind === "area" ? (
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={() => go(chart.href)}>
              <defs>
                {chart.series!.map((s) => (
                  <linearGradient key={s.key} id={`g-${chart.id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS[s.color]} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLORS[s.color]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} tickFormatter={(d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} minTickGap={24} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => compact(v, chart.format)} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [formatValue(Number(v), chart.format), String(n)]} labelFormatter={(d) => new Date(String(d)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} />
              {chart.series!.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[s.color]} strokeWidth={2} fill={`url(#g-${chart.id}-${s.key})`} animationDuration={600} style={{ cursor: "pointer" }} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : chart.kind === "donut" ? (
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <ResponsiveContainer width={190} height={190}>
              <PieChart>
                <Pie data={cats} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={2} animationDuration={600} stroke="none">
                  {cats.map((c, i) => (
                    <Cell key={c.name} fill={PALETTE[i % PALETTE.length]} style={{ cursor: c.href || chart.href ? "pointer" : "default" }} onClick={() => go(c.href ?? chart.href)} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [formatValue(Number(v), chart.format), String(n)]} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
              {cats.map((c, i) => (
                <li key={c.name}>
                  <button type="button" onClick={() => go(c.href ?? chart.href)} className="flex w-full items-center gap-2 text-left hover:text-primary">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="font-semibold tabular-nums">{formatValue(c.value, chart.format)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : chart.kind === "hbar" ? (
          <ResponsiveContainer width="100%" height={Math.max(160, cats.length * 38)}>
            <BarChart data={cats} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.5} />
              <XAxis type="number" tick={axis} tickLine={false} axisLine={false} domain={chart.format === "percent" ? [0, 100] : undefined} />
              <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={110} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.3 }} formatter={(v) => [formatValue(Number(v), chart.format), ""]} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="var(--primary)" animationDuration={600}>
                {cats.map((c) => (
                  <Cell key={c.name} style={{ cursor: "pointer" }} onClick={() => go(c.href ?? chart.href)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cats} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} interval={0} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={48} allowDecimals={false} tickFormatter={(v: number) => compact(v, chart.format)} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.3 }} formatter={(v) => [formatValue(Number(v), chart.format), ""]} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="var(--primary)" animationDuration={600}>
                {cats.map((c, i) => (
                  <Cell key={c.name} fill={PALETTE[i % PALETTE.length]} style={{ cursor: "pointer" }} onClick={() => go(c.href ?? chart.href)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </GlassCard>
  );
}
