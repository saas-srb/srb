"use client";

import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

/** OTS-specific charts; donut / horizontal-bar charts reuse the SOP ones (same tooltip surface, gradients, click-through). */

const TOOLTIP_STYLE = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--popover-foreground)" } as const;
const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" } as const;

function Empty({ label = "Nothing to show yet." }: { label?: string }) {
  return <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">{label}</div>;
}

export function AttemptTrendChart({ data }: { data: { label: string; value: number; passed: number }[] }) {
  if (data.every((d) => d.value === 0)) return <Empty label="No tests submitted in the last 12 weeks." />;
  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="otsTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="otsPassFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
        <Legend verticalAlign="bottom" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
        <Area type="monotone" dataKey="value" name="Submitted" stroke="var(--primary)" strokeWidth={2.5} fill="url(#otsTrendFill)" animationDuration={600} />
        <Area type="monotone" dataKey="passed" name="Passed" stroke="#10b981" strokeWidth={2} fill="url(#otsPassFill)" animationDuration={600} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DistributionChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.every((d) => d.value === 0)) return <Empty label="No evaluated attempts yet." />;
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="otsDistFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--color-brand-accent)" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
        <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
        <Bar dataKey="value" name="Attempts" fill="url(#otsDistFill)" radius={[6, 6, 0, 0]} animationDuration={600} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PassFailChart({ data }: { data: { label: string; passed: number; failed: number }[] }) {
  if (data.length === 0) return <Empty label="No results yet." />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.5} />
        <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={130} tick={AXIS_TICK} tickLine={false} axisLine={false} interval={0} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
        <Legend verticalAlign="bottom" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
        <Bar dataKey="passed" name="Passed" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
        <Bar dataKey="failed" name="Failed" stackId="a" fill="#f43f5e" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
