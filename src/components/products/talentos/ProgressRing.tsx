"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Animated SVG donut for a single 0–100 metric (attendance rate, profile
 * completeness, probation progress…). Theme-aware; stroke follows the brand
 * gradient, track uses the border token.
 */
export default function ProgressRing({
  value,
  label,
  sublabel,
  size = 132,
  stroke = 11,
  tone = "brand",
}: {
  value: number;
  label?: string;
  sublabel?: string;
  size?: number;
  stroke?: number;
  tone?: "brand" | "green" | "amber" | "red";
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const [shown, setShown] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / 700, 1);
      const eased = 1 - (1 - t) * (1 - t);
      setShown(Math.round(from + (clamped - from) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [clamped]);

  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - shown / 100);
  const strokeColor =
    tone === "green" ? "#22c55e" : tone === "amber" ? "#f59e0b" : tone === "red" ? "#ef4444" : "url(#ringGrad)";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--color-brand-accent)" />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} opacity={0.5} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black tabular-nums text-foreground">{shown}%</span>
          {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
        </div>
      </div>
      {label && <span className={cn("text-xs font-medium text-muted-foreground")}>{label}</span>}
    </div>
  );
}
