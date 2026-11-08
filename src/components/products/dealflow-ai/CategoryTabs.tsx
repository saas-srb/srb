"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import StatusPieChart from "@/components/products/dealflow-ai/StatusPieChart";
import ConversionFunnel from "@/components/products/dealflow-ai/ConversionFunnel";
import TrendComparisonChart, { buildTrendComparisonData } from "@/components/products/dealflow-ai/TrendComparisonChart";
import { iconForCategory } from "@/lib/category-icons";
import { CATEGORY_CHART_COLORS } from "@/lib/category-colors";
import { LEAD_STATUSES } from "@/lib/lead-status";
import { cn } from "@/lib/utils";
import type { CategorySlug } from "@/lib/categories";

export interface CategoryPanelData {
  slug: CategorySlug;
  label: string;
  total: number;
  growthPercent: number | null;
  byStatus: Record<string, number>;
  bySubService: { subService: string; label: string; count: number }[];
  timeSeries: { date: string; count: number }[];
  previousTimeSeries: { date: string; count: number }[];
  funnel: { stage: string; count: number }[];
}

export default function CategoryTabs({ categories }: { categories: CategoryPanelData[] }) {
  const [active, setActive] = useState<CategorySlug | null>(categories[0]?.slug ?? null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const isDark = mounted && resolvedTheme === "dark";

  if (categories.length === 0) return null;

  const activeCategory = categories.find((c) => c.slug === active) ?? categories[0];

  return (
    <div className="space-y-4">
      {categories.length > 1 && (
        <PanelTabs
          label="Categories"
          active={activeCategory.slug}
          onSelect={(k) => setActive(k as CategorySlug)}
          tabs={categories.map((c) => {
            const Icon = iconForCategory(c.slug);
            const color = isDark ? CATEGORY_CHART_COLORS[c.slug].dark : CATEGORY_CHART_COLORS[c.slug].light;
            return { key: c.slug, label: c.label, count: c.total, icon: <Icon className="size-3.5" style={{ color: activeCategory.slug === c.slug ? color : undefined }} /> };
          })}
        />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={activeCategory.slug}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard>
              <CardHeader><CardTitle>Submissions Trend</CardTitle></CardHeader>
              <CardContent><TimeSeriesChart data={activeCategory.timeSeries} /></CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader>
                <CardTitle>This Period vs Previous</CardTitle>
              </CardHeader>
              <CardContent>
                <TrendComparisonChart data={buildTrendComparisonData(activeCategory.timeSeries, activeCategory.previousTimeSeries)} />
                <p className="mt-1 text-xs text-muted-foreground">Aligned by day-of-period, not calendar date.</p>
              </CardContent>
            </GlassCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard>
              <CardHeader><CardTitle>Sub-Service Breakdown</CardTitle></CardHeader>
              <CardContent>
                {activeCategory.bySubService.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No sub-service data yet.</div>
                ) : (
                  <CategoryBarChart data={activeCategory.bySubService.slice(0, 6).map((s) => ({ label: s.label, value: s.count }))} />
                )}
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader><CardTitle>Status Distribution</CardTitle></CardHeader>
              <CardContent>
                <StatusPieChart
                  data={LEAD_STATUSES.map((s) => ({ status: s.value, label: s.label, count: activeCategory.byStatus[s.value] ?? 0 }))}
                />
              </CardContent>
            </GlassCard>
          </div>

          <GlassCard>
            <CardHeader><CardTitle>Conversion Funnel</CardTitle></CardHeader>
            <CardContent>
              <ConversionFunnel stages={activeCategory.funnel} rejectedCount={activeCategory.byStatus.rejected ?? 0} />
            </CardContent>
          </GlassCard>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
