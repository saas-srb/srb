"use client";

import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export { DonutChart, BarsChart } from "@/components/products/playbook-ai/SopCharts";

/**
 * SEO trend charts in the platform's chart style (same tooltip surface, axis
 * ticks and gradients as the SOP/LMS charts), adding multi-series lines and a
 * reversed axis for keyword positions (1 at the top).
 */

const TOOLTIP_STYLE = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--popover-foreground)" } as const;
const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

export interface Series {
  key: string;
  label: string;
  color: string;
  axis?: "left" | "right";
}

type Row = Record<string, string | number | null>;

function Empty({ label }: { label: string }) {
  return <div className="flex h-60 items-center justify-center px-6 text-center text-sm text-muted-foreground">{label}</div>;
}

const hasData = (data: Row[], series: Series[]) => data.some((d) => series.some((s) => typeof d[s.key] === "number" && d[s.key] !== 0));

export function LineTrend({ data, series, emptyLabel = "No data yet.", reversed = false, height = 250 }: { data: Row[]; series: Series[]; emptyLabel?: string; reversed?: boolean; height?: number }) {
  if (!hasData(data, series)) return <Empty label={emptyLabel} />;
  const right = series.some((s) => s.axis === "right");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: right ? 4 : 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={18} />
        <YAxis yAxisId="left" reversed={reversed} allowDecimals={!reversed} tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} domain={reversed ? [1, "auto"] : [0, "auto"]} />
        {right && <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />}
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        {series.length > 1 && <Legend verticalAlign="bottom" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />}
        {series.map((s) => (
          <Line key={s.key} yAxisId={s.axis ?? "left"} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.25} dot={data.length < 20} connectNulls animationDuration={600} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AreaTrend({ data, series, emptyLabel = "No data yet.", height = 250, stacked = false }: { data: Row[]; series: Series[]; emptyLabel?: string; height?: number; stacked?: boolean }) {
  if (!hasData(data, series)) return <Empty label={emptyLabel} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`seo-area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={18} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        {series.length > 1 && <Legend verticalAlign="bottom" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />}
        {series.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.25} fill={`url(#seo-area-${s.key})`} stackId={stacked ? "a" : undefined} connectNulls animationDuration={600} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ColumnBars({ data, series, emptyLabel = "No data yet.", height = 250, stacked = false }: { data: Row[]; series: Series[]; emptyLabel?: string; height?: number; stacked?: boolean }) {
  if (!hasData(data, series)) return <Empty label={emptyLabel} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={8} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
        {series.length > 1 && <Legend verticalAlign="bottom" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? "a" : undefined} radius={stacked && i < series.length - 1 ? 0 : [6, 6, 0, 0]} animationDuration={600} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export const COLORS = { primary: "#6366f1", cyan: "#06b6d4", amber: "#f59e0b", pink: "#ec4899", green: "#10b981", violet: "#8b5cf6", red: "#ef4444", blue: "#3b82f6" };
