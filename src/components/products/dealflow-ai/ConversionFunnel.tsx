"use client";

import { motion } from "framer-motion";

interface FunnelStage {
  stage: string;
  count: number;
}

export default function ConversionFunnel({ stages, rejectedCount }: { stages: FunnelStage[]; rejectedCount: number }) {
  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const widthPercent = Math.max((s.count / max) * 100, s.count > 0 ? 8 : 2);
        const prev = i > 0 ? stages[i - 1].count : null;
        const dropoffPercent = prev && prev > 0 ? Math.round((1 - s.count / prev) * 1000) / 10 : null;

        return (
          <div key={s.stage}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{s.stage}</span>
              <span className="text-muted-foreground">
                {s.count}
                {dropoffPercent !== null && dropoffPercent > 0 && (
                  <span className="ml-1.5 text-destructive">-{dropoffPercent}%</span>
                )}
              </span>
            </div>
            <div className="h-8 w-full overflow-hidden rounded-lg bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${widthPercent}%` }}
                transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
                className="h-full rounded-lg bg-gradient-to-r from-primary to-brand-accent"
              />
            </div>
          </div>
        );
      })}
      {rejectedCount > 0 && (
        <p className="pt-1 text-xs text-muted-foreground">
          <span className="font-medium text-destructive">{rejectedCount}</span> rejected (not shown in funnel above)
        </p>
      )}
    </div>
  );
}
