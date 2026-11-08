"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/** A line chart of real daily values. No data = an honest empty message, never a placeholder line. */
export default function MetricsTrendChart({ data, label, empty }: { data: { date: string; value: number }[]; label: string; empty: string }) {
  if (data.length === 0) return <div className="flex h-56 items-center justify-center px-4 text-center text-sm text-muted-foreground">{empty}</div>;
  return (
    <div role="img" aria-label={`${label}: ${data.length} daily values from ${data[0].date} to ${data[data.length - 1].date}`}>
      <ResponsiveContainer width="100%" height={224}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => Intl.NumberFormat("en-IN", { notation: "compact" }).format(v)} />
          <Tooltip formatter={(v) => [Number(v).toLocaleString("en-IN"), label]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
          <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={data.length < 20} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
