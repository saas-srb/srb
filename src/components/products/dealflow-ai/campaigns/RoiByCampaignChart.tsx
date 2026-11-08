"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, ReferenceLine } from "recharts";

interface Row {
  name: string;
  roiPercent: number | null;
}

export default function RoiByCampaignChart({ data }: { data: Row[] }) {
  const rows = data
    .filter((d): d is { name: string; roiPercent: number } => d.roiPercent != null)
    .sort((a, b) => b.roiPercent - a.roiPercent)
    .slice(0, 12);

  if (rows.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No ROI yet — add deal values to completed leads to see returns.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" opacity={0.5} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
        <ReferenceLine x={0} stroke="var(--border)" />
        <Tooltip
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--popover-foreground)" }}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          formatter={(value) => [`${Number(value)}%`, "ROI"]}
        />
        <Bar dataKey="roiPercent" radius={[0, 4, 4, 0]} animationDuration={600}>
          {rows.map((r) => (
            <Cell key={r.name} fill={r.roiPercent >= 0 ? "var(--color-brand-deep)" : "var(--destructive)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
