"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { LEAD_STATUSES } from "@/lib/lead-status";

export interface StackedRow {
  category: string;
  label: string;
  new: number;
  in_progress: number;
  completed: number;
  rejected: number;
}

export default function StackedCategoryStatusChart({ data }: { data: StackedRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-15}
          textAnchor="end"
          height={50}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={32} />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            fontSize: 12,
            color: "var(--popover-foreground)",
          }}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
        {LEAD_STATUSES.map((s) => (
          <Bar key={s.value} dataKey={s.value} name={s.label} stackId="a" fill={s.chartColor} animationDuration={600} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
