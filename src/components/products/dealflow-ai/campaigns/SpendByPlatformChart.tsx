"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { getPlatformMeta, type CampaignPlatform } from "@/lib/campaign-platforms";

interface Slice {
  platform: CampaignPlatform;
  spend: number;
  leadsAttributed: number;
  revenue: number;
}

export default function SpendByPlatformChart({ data, currency }: { data: Slice[]; currency: string }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const isDark = mounted && resolvedTheme === "dark";

  const rows = data.filter((d) => d.spend > 0);
  if (rows.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No spend recorded yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={rows} dataKey="spend" nameKey="platform" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} animationDuration={600}>
          {rows.map((r) => {
            const c = getPlatformMeta(r.platform).color;
            return <Cell key={r.platform} fill={isDark ? c.dark : c.light} stroke="var(--card)" strokeWidth={2} />;
          })}
        </Pie>
        <Tooltip
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--popover-foreground)" }}
          formatter={(value, name) => [`${currency} ${Number(value).toLocaleString("en-IN")}`, getPlatformMeta(String(name)).shortLabel]}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
          formatter={(value: string) => getPlatformMeta(value).shortLabel}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
