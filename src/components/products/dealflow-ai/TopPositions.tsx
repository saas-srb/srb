"use client";

import { motion } from "framer-motion";

interface TopPositionDatum {
  positionTitle: string;
  count: number;
}

export default function TopPositions({ data }: { data: TopPositionDatum[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No applications yet.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-4">
      {data.map((d, i) => (
        <div key={d.positionTitle}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{d.positionTitle}</span>
            <span className="text-muted-foreground">{d.count}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(d.count / max) * 100}%` }}
              transition={{ duration: 0.5, delay: i * 0.05, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-primary to-brand-accent"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
