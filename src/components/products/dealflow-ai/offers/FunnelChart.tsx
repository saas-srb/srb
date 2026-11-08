"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, LabelList } from "recharts";

interface Stage {
  label: string;
  value: number;
}

/** Single-series funnel bar chart — one color, direct value labels, no legend needed for one series. */
export default function FunnelChart({ stages }: { stages: Stage[] }) {
  if (stages.every((s) => s.value === 0)) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No activity recorded yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={stages} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.5} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 12, fill: "var(--foreground)" }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--popover-foreground)" }}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
        />
        <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={28}>
          <LabelList dataKey="value" position="right" style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }} />
          {stages.map((s) => (
            <Cell key={s.label} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
