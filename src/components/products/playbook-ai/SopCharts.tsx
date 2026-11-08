"use client";

import { useRouter } from "next/navigation";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import type { ChartDatum } from "@/lib/products/playbook-ai/analytics";

/**
 * Dashboard charts. They reuse the look of the shared LMS/FMS charts (same
 * tooltip surface, gradient bars, donut style) and add click-through: a
 * datum carrying an `href` navigates to the matching filtered SOP list.
 */

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;
const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const;
const PALETTE = ["#6366f1", "#06b6d4", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6", "#ef4444", "#3b82f6", "#84cc16", "#f97316"];

function Empty({ label = "Nothing to show yet." }: { label?: string }) {
  return <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">{label}</div>;
}

export function DonutChart({ data, emptyLabel }: { data: ChartDatum[]; emptyLabel?: string }) {
  const router = useRouter();
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <Empty label={emptyLabel} />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius={58} outerRadius={88} paddingAngle={2} cornerRadius={6} animationDuration={600}>
          {data.map((d, i) => (
            <Cell
              key={d.key}
              fill={d.color ?? PALETTE[i % PALETTE.length]}
              stroke="var(--card)"
              strokeWidth={2}
              style={{ cursor: d.href ? "pointer" : "default", outline: "none" }}
              onClick={() => d.href && router.push(d.href)}
            />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BarsChart({
  data,
  suffix = "",
  max,
  emptyLabel,
}: {
  data: ChartDatum[];
  suffix?: string;
  max?: number;
  emptyLabel?: string;
}) {
  const router = useRouter();
  if (data.length === 0) return <Empty label={emptyLabel} />;
  const rows = data.slice(0, 12);
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 30 + 30)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="sopBarFill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--color-brand-accent)" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.5} />
        <XAxis type="number" allowDecimals={false} domain={max ? [0, max] : undefined} tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={112} tick={AXIS_TICK} tickLine={false} axisLine={false} interval={0} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.4 }} formatter={(v) => `${v}${suffix}`} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={600}>
          {rows.map((d) => (
            <Cell key={d.key} fill={d.color ?? "url(#sopBarFill)"} style={{ cursor: d.href ? "pointer" : "default" }} onClick={() => d.href && router.push(d.href)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data, id }: { data: { label: string; value: number }[]; id: string }) {
  if (data.every((d) => d.value === 0)) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--color-brand-accent)" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
        <Area type="monotone" dataKey="value" name="SOPs" stroke={`url(#${id}-stroke)`} strokeWidth={2.5} fill={`url(#${id}-fill)`} animationDuration={600} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ColumnsChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.every((d) => d.value === 0)) return <Empty label="No SOPs are due to expire in the next six months." />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="sopColFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
        <Bar dataKey="value" name="Expiring" fill="url(#sopColFill)" radius={[6, 6, 0, 0]} animationDuration={600} />
      </BarChart>
    </ResponsiveContainer>
  );
}
