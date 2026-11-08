"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCompact } from "@/lib/utils";

interface Point {
  date: string;
  spend: number;
  leads: number;
}

export default function CampaignSpendLeadsChart({ data, currency }: { data: Point[]; currency: string }) {
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No spend or leads in this range.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="campaignSpendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.7} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.25} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis
          yAxisId="spend"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v) => formatCompact(v)}
        />
        <YAxis
          yAxisId="leads"
          orientation="right"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--popover-foreground)" }}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          formatter={(value, name) => (name === `Spend (${currency})` ? `${currency} ${Number(value).toLocaleString("en-IN")}` : String(value))}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
        <Bar yAxisId="spend" dataKey="spend" name={`Spend (${currency})`} fill="url(#campaignSpendFill)" radius={[4, 4, 0, 0]} maxBarSize={40} animationDuration={600} />
        <Line yAxisId="leads" type="monotone" dataKey="leads" name="Attributed leads" stroke="var(--color-brand-accent)" strokeWidth={2.5} dot={false} animationDuration={700} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
