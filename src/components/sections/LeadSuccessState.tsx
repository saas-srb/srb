"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { useUiLabels } from "@/components/products/sitecraft-ai/SiteInfoContext";

interface LeadSuccessStateProps {
  title?: string;
  description: string;
  onDismiss: () => void;
  compact?: boolean;
  /** How long until this auto-dismisses, in ms — must match the caller's actual timer. */
  autoHideMs?: number;
}

export default function LeadSuccessState({
  title: titleProp,
  description,
  onDismiss,
  compact = false,
  autoHideMs = 30_000,
}: LeadSuccessStateProps) {
  const l = useUiLabels();
  const title = titleProp ?? l.messageSent;
  const [secondsLeft, setSecondsLeft] = useState(Math.round(autoHideMs / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const ringSize = compact ? 84 : 112;
  const badgeSize = compact ? 56 : 80;
  const strokeWidth = compact ? 3 : 3.5;
  const radius = (ringSize - strokeWidth) / 2;
  const center = ringSize / 2;
  const gradientId = compact ? "leadSuccessRingCompact" : "leadSuccessRingFull";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -8 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={`relative z-10 flex flex-col items-center text-center overflow-hidden ${compact ? "py-8 gap-3" : "py-12 gap-4"}`}
    >
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute left-1/2 top-1/2 w-40 h-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl animate-blob" />
        <div className="absolute left-1/2 top-1/2 w-32 h-32 -translate-x-[65%] -translate-y-1/2 rounded-full bg-brand-accent/10 blur-3xl animate-blob animation-delay-2000" />
      </div>

      <div className="relative flex items-center justify-center" style={{ width: ringSize, height: ringSize }}>
        <svg width={ringSize} height={ringSize} className="absolute -rotate-90">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--brand-gradient)" />
            </linearGradient>
          </defs>
          <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-border" />
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            initial={{ pathLength: 1 }}
            animate={{ pathLength: 0 }}
            transition={{ duration: autoHideMs / 1000, ease: "linear" }}
          />
        </svg>

        <motion.span
          initial={{ scale: 0.5, opacity: 0.55 }}
          animate={{ scale: 1.6, opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.15 }}
          className="absolute rounded-full bg-primary/40"
          style={{ width: badgeSize, height: badgeSize }}
        />
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.05 }}
          className="relative flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent shadow-lg shadow-primary/30"
          style={{ width: badgeSize, height: badgeSize }}
        >
          <Check className={compact ? "w-7 h-7 text-primary-foreground" : "w-10 h-10 text-primary-foreground"} strokeWidth={3} />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.35 }}
        className={compact ? "space-y-1.5" : "space-y-2"}
      >
        <h3 className={`font-bold text-foreground ${compact ? "text-lg" : "text-2xl"}`}>{title}</h3>
        <p className={`text-muted-foreground ${compact ? "text-sm max-w-xs" : "max-w-sm"}`}>{description}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.35 }}
        className="flex items-center gap-2 text-xs text-muted-foreground mt-1"
      >
        <span>Closing in {secondsLeft}s</span>
        <span aria-hidden="true" className="text-muted-foreground/50">&middot;</span>
        <button
          type="button"
          onClick={onDismiss}
          className="font-semibold text-primary hover:underline underline-offset-4"
        >
          {l.sendAnother}
        </button>
      </motion.div>
    </motion.div>
  );
}
