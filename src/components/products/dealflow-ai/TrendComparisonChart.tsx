"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export interface TrendComparisonPoint {
  index: number;
  current: number;
  previous: number;
}

/** Zips two time-series (which cover different calendar ranges) by sorted ordinal
 * index, e.g. "Day 1 of this period" vs "Day 1 of the previous period" — the only
 * way to overlay them on one axis since their actual dates don't line up. */
export function buildTrendComparisonData(
  current: { date: string; count: number }[],
  previous: { date: string; count: number }[]
): TrendComparisonPoint[] {
  const length = Math.max(current.length, previous.length);
  return Array.from({ length }, (_, i) => ({
    index: i + 1,
    current: current[i]?.count ?? 0,
    previous: previous[i]?.count ?? 0,
  }));
}

export default function TrendComparisonChart({
  data,
  currentLabel = "This period",
  previousLabel = "Previous period",
}: {
  data: TrendComparisonPoint[];
  currentLabel?: string;
  previousLabel?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Not enough data to compare periods.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
        <XAxis
          dataKey="index"
          tickFormatter={(v) => `Day ${v}`}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={32} />
        <Tooltip
          labelFormatter={(v) => `Day ${v}`}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            fontSize: 12,
            color: "var(--popover-foreground)",
          }}
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
        <Line type="monotone" dataKey="current" name={currentLabel} stroke="var(--primary)" strokeWidth={2.5} dot={false} animationDuration={600} />
        <Line
          type="monotone"
          dataKey="previous"
          name={previousLabel}
          stroke="var(--muted-foreground)"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
          animationDuration={600}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
