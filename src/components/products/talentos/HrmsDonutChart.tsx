"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const DEFAULT_COLORS = [
  "hsl(var(--primary))",
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#64748b",
];

export interface HrmsDonutDatum {
  label: string;
  count: number;
  status?: string;
  value?: number;
}

export default function HrmsDonutChart({
  data,
  unit = "Employees",
  height = 280,
}: {
  data: HrmsDonutDatum[];
  unit?: string;
  height?: number;
}) {
  const filteredData = data
    .map((d) => ({
      label: d.label,
      value: d.count ?? d.value ?? 0,
    }))
    .filter((d) => d.value > 0);

  const total = filteredData.reduce((sum, d) => sum + d.value, 0);

  if (filteredData.length === 0 || total === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
        No workforce data available for the selected period.
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={filteredData}
            dataKey="value"
            nameKey="label"
            innerRadius={65}
            outerRadius={95}
            paddingAngle={3}
            cornerRadius={6}
            animationDuration={800}
          >
            {filteredData.map((d, index) => (
              <Cell
                key={d.label}
                fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                stroke="var(--card)"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(val: unknown) => [
              `${Number(val || 0)} ${unit}`,
              "Count",
            ]}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              fontSize: "12px",
              color: "var(--popover-foreground)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          />
          <Legend
            verticalAlign="bottom"
            align="center"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{
              fontSize: "11px",
              paddingTop: "12px",
              color: "var(--muted-foreground)",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
