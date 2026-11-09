"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { nf } from "@/lib/products/playbook-ai/dashboard/format";
import type { HistBucket, TrendPoint } from "@/lib/products/playbook-ai/dashboard/types";

/**
 * Dashboard charts (Recharts, theme variables so they follow dark mode). Each one sits in a figure with a text summary for screen readers, and
 * shows an empty message instead of an empty plot.
 */

const TOOLTIP = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--popover-foreground)" } as const;
const TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const;
export const COLORS = { sop: "#6366f1", document: "#06b6d4", kpi: "#f59e0b", good: "#10b981", bad: "#ef4444", neutral: "#94a3b8" };
const PALETTE = ["#6366f1", "#06b6d4", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6", "#ef4444", "#3b82f6", "#84cc16", "#f97316"];

function Figure({ label, summary, empty, emptyText, height = 240, children }: { label: string; summary: string; empty: boolean; emptyText: string; height?: number; children: React.ReactNode }) {
  return (
    <figure aria-label={label} className="m-0">
      <figcaption className="sr-only">{summary}</figcaption>
      {empty ? <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>{emptyText}</div> : <div style={{ height }}>{children}</div>}
    </figure>
  );
}

export interface StackSeries { key: string; name: string; color: string }
/** Stacked bars over time (one bar per day or week). `points` carry a `label` and one number per series key. */
export function StackedBars({ points, series, label, noun, emptyText }: { points: object[]; series: StackSeries[]; label: string; noun: string; emptyText: string }) {
  const rows = points as Record<string, number | string>[];
  const total = rows.reduce((s, p) => s + series.reduce((t, k) => t + Number(p[k.key] ?? 0), 0), 0);
  return (
    <Figure label={label} summary={`${nf.format(total)} ${noun}, split into ${series.map((s) => s.name).join(", ")}.`} empty={total === 0} emptyText={emptyText}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => <Bar key={s.key} isAnimationActive={false} dataKey={s.key} name={s.name} stackId="a" fill={s.color} radius={i === series.length - 1 ? [4, 4, 0, 0] : undefined} />)}
        </BarChart>
      </ResponsiveContainer>
    </Figure>
  );
}

export function Donut({ data, label, emptyText }: { data: { label: string; value: number }[]; label: string; emptyText: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Figure label={label} summary={`${label}: ${data.map((d) => `${d.label} ${nf.format(d.value)}`).join(", ")}.`} empty={total === 0} emptyText={emptyText} height={220}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={54} outerRadius={84} paddingAngle={2} cornerRadius={5} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={d.label} fill={PALETTE[i % PALETTE.length]} stroke="var(--card)" strokeWidth={2} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </Figure>
  );
}

export function Histogram({ data, label, emptyText }: { data: HistBucket[]; label: string; emptyText: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Figure label={label} summary={`${label}: ${data.map((d) => `${d.label} ${nf.format(d.value)}`).join(", ")}.`} empty={total === 0} emptyText={emptyText} height={200}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
          <Bar isAnimationActive={false} dataKey="value" name="Items" fill={COLORS.sop} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Figure>
  );
}

export function TrendLine({ data, unit, label, emptyText }: { data: TrendPoint[]; unit: string; label: string; emptyText: string }) {
  const has = data.some((d) => d.value !== null);
  return (
    <Figure label={label} summary={`${label}: ${data.filter((d) => d.value !== null).map((d) => `${d.label} ${d.value} ${unit}`).join(", ") || "no data"}.`} empty={!has} emptyText={emptyText} height={200}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} unit={` ${unit.slice(0, 1)}`} />
          <Tooltip contentStyle={TOOLTIP} formatter={(v) => [`${v} ${unit}`, "Average"]} />
          <Line isAnimationActive={false} type="monotone" dataKey="value" stroke={COLORS.good} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </Figure>
  );
}

export function MiniBars({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Figure label={label} summary={`${label}: ${nf.format(total)} in total.`} empty={total === 0} emptyText="No AI runs in this period." height={110}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
          <XAxis dataKey="label" hide />
          <Bar isAnimationActive={false} dataKey="value" name="AI runs" fill={COLORS.sop} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Figure>
  );
}
