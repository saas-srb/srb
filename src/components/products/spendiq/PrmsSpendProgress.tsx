"use client";

import { motion } from "framer-motion";
import { formatMoney } from "@/lib/products/spendiq/constants";

export interface ProgressDatum {
  label: string;
  value: number;
  sublabel?: string;
}

export default function PrmsSpendProgress({
  data,
  currency = "INR",
  maxItems = 5,
}: {
  data: ProgressDatum[];
  currency?: string;
  maxItems?: number;
}) {
  const items = data.filter((d) => d.value > 0).slice(0, maxItems);
  const maxValue = Math.max(...items.map((d) => d.value), 1);
  const totalValue = items.reduce((sum, d) => sum + d.value, 0);

  if (items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
        No expense data recorded.
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {items.map((item, index) => {
        const percent = Math.round((item.value / (totalValue || 1)) * 100);
        return (
          <div key={item.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="font-semibold text-foreground truncate max-w-[200px]">
                {item.label}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground font-mono">
                  {percent}%
                </span>
                <span className="font-mono font-bold text-foreground">
                  {formatMoney(item.value, currency)}
                </span>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(item.value / maxValue) * 100}%` }}
                transition={{ duration: 0.6, delay: index * 0.08, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
