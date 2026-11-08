"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Clock } from "lucide-react";
import { nowMs, getUrgency, splitDuration, pad2, URGENCY_STYLES } from "@/lib/offers/live";
import { useText } from "@/components/products/sitecraft-ai/TextContext";

/**
 * Remaining time to `endDate`, ticking exactly on the second boundary and
 * re-syncing when the tab regains focus (browsers throttle timers in
 * background tabs, so a plain setInterval drifts by minutes). Uses the
 * server-accurate clock from `@/lib/offers/live`, never the raw device clock.
 * Returns null until mounted so SSR and the first client render match.
 */
export function useRemaining(endDate: string, onExpire?: () => void): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);
  const expireRef = useRef(onExpire);
  const expiredFired = useRef(false);

  useEffect(() => {
    expireRef.current = onExpire;
  });

  useEffect(() => {
    const end = new Date(endDate).getTime();
    let timer: ReturnType<typeof setTimeout> | undefined;
    expiredFired.current = false;

    function tick() {
      const left = Math.max(end - nowMs(), 0);
      setRemaining(left);
      if (left <= 0) {
        if (!expiredFired.current) {
          expiredFired.current = true;
          expireRef.current?.();
        }
        return;
      }
      // Sleep until the next whole-second boundary of the remaining time.
      timer = setTimeout(tick, Math.min(Math.max(left % 1000, 40), 1000));
    }

    function resync() {
      if (timer) clearTimeout(timer);
      tick();
    }

    tick();
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  }, [endDate]);

  return remaining;
}

function Digit({ value, animate }: { value: string; animate: boolean }) {
  if (!animate) return <span>{value}</span>;
  return (
    <span className="relative inline-block overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "-60%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "60%", opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Unit({ value, label, animate, tone, onDark }: { value: number; label: string; animate: boolean; tone: string; onDark?: boolean }) {
  return (
    <div className={`flex min-w-[58px] flex-col items-center rounded-2xl border px-3 py-2.5 sm:min-w-[68px] sm:px-4 sm:py-3 ${onDark ? "border-white/20 bg-white/10 backdrop-blur-sm" : `bg-muted/30 ${tone}`}`}>
      <span className={`text-2xl font-black tabular-nums leading-none sm:text-3xl ${onDark ? "text-white" : "text-foreground"}`}>
        <Digit value={pad2(value)} animate={animate} />
      </span>
      <span className={`mt-1 text-[10px] font-medium uppercase tracking-wide ${onDark ? "text-white/60" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

/** Presentational pill for callers that already own a `useRemaining` value (avoids a second timer per offer card). */
export function CountdownPill({ remaining, className = "" }: { remaining: number; className?: string }) {
  const tx = useText();
  const reduce = useReducedMotion();
  const urgency = getUrgency(remaining);
  const styles = URGENCY_STYLES[urgency.level];
  const { days, hours, minutes, seconds } = splitDuration(remaining);
  if (urgency.level === "ended") return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles.chip} ${className}`}>{tx("offers.liveCountdown.offer-ended")}</span>;
  return (
    <span
      role="timer"
      aria-label={`${days} days ${hours} hours ${minutes} minutes remaining`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${styles.chip} ${className}`}
    >
      <Clock className={`size-3 ${urgency.level === "critical" && !reduce ? "animate-pulse" : ""}`} />
      {days > 0 ? `${days}d ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}` : `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`}
    </span>
  );
}

export type CountdownVariant = "boxes" | "strip" | "pill" | "inline";

/**
 * One countdown for every surface:
 *  - `boxes`  hero / deal-of-the-day / popup: animated digit blocks + urgency line + optional progress bar
 *  - `strip`  slim top bar: "03d 04h 12m 09s" (use `onDark` on the dark strip)
 *  - `pill`   offer cards: compact chip that escalates colour as the deadline nears
 *  - `inline` plain text, e.g. inside table rows
 */
export default function LiveCountdown({
  endDate,
  startDate,
  variant = "boxes",
  label,
  onDark = false,
  showUrgency = true,
  onExpire,
  className = "",
}: {
  endDate: string;
  /** When given (boxes variant), renders an elapsed-time progress bar. */
  startDate?: string;
  variant?: CountdownVariant;
  label?: string;
  onDark?: boolean;
  showUrgency?: boolean;
  onExpire?: () => void;
  className?: string;
}) {
  const tx = useText();
  const remaining = useRemaining(endDate, onExpire);
  const reduce = useReducedMotion();

  if (remaining === null) {
    return variant === "boxes" ? <div className={`h-[92px] ${className}`} aria-hidden="true" /> : <span className={`inline-block h-4 w-24 ${className}`} aria-hidden="true" />;
  }

  const urgency = getUrgency(remaining);
  const styles = URGENCY_STYLES[urgency.level];
  const { days, hours, minutes, seconds } = splitDuration(remaining);
  const animate = !reduce;
  // Screen readers get a calm, low-frequency label instead of a ticking region.
  const aria = urgency.level === "ended" ? "Offer ended" : `${days} days ${hours} hours ${minutes} minutes remaining`;

  if (variant === "inline") {
    if (urgency.level === "ended") return <span className={className}>{tx("offers.liveCountdown.ended")}</span>;
    return (
      <span className={`tabular-nums ${className}`} role="timer" aria-label={aria}>
        {days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m ${pad2(seconds)}s`}
      </span>
    );
  }

  if (variant === "strip") {
    if (urgency.level === "ended") return <span className={onDark ? "text-background/70" : "text-muted-foreground"}>{tx("offers.liveCountdown.ended")}</span>;
    const urgent = urgency.level === "critical" || urgency.level === "urgent";
    return (
      <span
        role="timer"
        aria-label={aria}
        className={`inline-flex items-center gap-1.5 tabular-nums ${urgent ? "font-bold text-red-400" : onDark ? "text-background/80" : "text-muted-foreground"} ${className}`}
      >
        <Clock className={`size-3.5 ${urgent && animate ? "animate-pulse" : ""}`} />
        <span className="text-[0.7rem] uppercase tracking-wide opacity-80">{label ?? urgency.label ?? "Ends in"}</span>
        <span className="font-semibold">
          {days > 0 && `${pad2(days)}d `}
          {pad2(hours)}h {pad2(minutes)}m {pad2(seconds)}s
        </span>
      </span>
    );
  }

  if (variant === "pill") {
    if (urgency.level === "ended") return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles.chip} ${className}`}>{tx("offers.liveCountdown.offer-ended")}</span>;
    return (
      <span
        role="timer"
        aria-label={aria}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${styles.chip} ${className}`}
      >
        <Clock className={`size-3 ${urgency.level === "critical" && animate ? "animate-pulse" : ""}`} />
        {days > 0 ? `${days}d ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}` : `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`}
      </span>
    );
  }

  // boxes
  if (urgency.level === "ended") {
    return <p className={`text-sm font-semibold ${onDark ? "text-white/70" : "text-muted-foreground"} ${className}`}>{tx("offers.liveCountdown.this-offer-has-ended")}</p>;
  }

  let elapsedPct: number | null = null;
  if (startDate) {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (end > start) elapsedPct = Math.min(Math.max(((nowMs() - start) / (end - start)) * 100, 0), 100);
  }

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <p className={`text-xs font-semibold uppercase tracking-widest ${onDark ? "text-white/70" : "text-muted-foreground"}`}>{label ?? "Offer ends in"}</p>
      <div className="flex items-center gap-1.5 sm:gap-2.5" role="timer" aria-label={aria}>
        {days > 0 && <Unit value={days} label={tx("offers.liveCountdown.days")} animate={animate} tone={styles.box} onDark={onDark} />}
        <Unit value={hours} label={tx("offers.liveCountdown.hours")} animate={animate} tone={styles.box} onDark={onDark} />
        <Unit value={minutes} label={tx("offers.liveCountdown.minutes")} animate={animate} tone={styles.box} onDark={onDark} />
        <Unit value={seconds} label={tx("offers.liveCountdown.seconds")} animate={animate} tone={styles.box} onDark={onDark} />
      </div>
      {showUrgency && urgency.message && (
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${styles.text}`}>
          <span className={`size-1.5 rounded-full ${styles.bar} ${animate ? "animate-pulse" : ""}`} />
          {urgency.message}
        </p>
      )}
      {elapsedPct !== null && (
        <div className="w-full max-w-xs" aria-hidden="true">
          <div className={`h-1.5 overflow-hidden rounded-full ${onDark ? "bg-white/15" : "bg-muted"}`}>
            <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${styles.bar}`} style={{ width: `${elapsedPct}%` }} />
          </div>
          <p className={`mt-1 text-[10px] uppercase tracking-wide ${onDark ? "text-white/60" : "text-muted-foreground"}`}>{Math.round(elapsedPct)}{tx("offers.liveCountdown.of-the-offer-window-gone")}</p>
        </div>
      )}
    </div>
  );
}
