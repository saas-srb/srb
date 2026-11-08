"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { LEAD_STATUSES } from "@/lib/lead-status";

const STATUS_COLORS: Record<string, string> = Object.fromEntries(LEAD_STATUSES.map((s) => [s.value, s.chartColor]));

export interface StatusPieDatum {
  status: string;
  label: string;
  count: number;
}

export default function StatusPieChart({ data, colors }: { data: StatusPieDatum[]; colors?: Record<string, string> }) {
  const palette = colors ?? STATUS_COLORS;
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No submissions in this range.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          cornerRadius={6}
          animationDuration={600}
        >
          {data.map((d) => (
            <Cell key={d.status} fill={palette[d.status] ?? "#94a3b8"} stroke="var(--card)" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            fontSize: 12,
            color: "var(--popover-foreground)",
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
