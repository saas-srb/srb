"use client";

import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/** A live countdown to `endsAt` (epoch ms). Renders nothing once it has passed. `variant="bar"` is the compact one for the top strip. */
export default function Countdown({ endsAt, variant = "big" }: { endsAt: number; variant?: "big" | "bar" | "mini" }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <div className={variant === "bar" ? "h-7 w-40" : variant === "mini" ? "h-5 w-44" : "h-24"} aria-hidden />;
  const ms = endsAt - now;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const parts = [["Days", Math.floor(s / 86400)], ["Hours", Math.floor((s % 86400) / 3600)], ["Min", Math.floor((s % 3600) / 60)], ["Sec", s % 60]] as const;
  if (variant === "mini") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[12px] font-black tabular-nums" role="timer" aria-label="Time left on the offer">
        {parts.map(([l, v], i) => (<span key={l}>{i > 0 && <span className="opacity-50">:</span>}{pad(v)}<span className="ml-px text-[9px] font-bold uppercase opacity-70">{l[0].toLowerCase()}</span></span>))}
      </span>
    );
  }
  if (variant === "bar") {
    return (
      <span className="inline-flex items-stretch gap-1.5" role="timer" aria-label="Time left on the offer">
        {parts.map(([l, v], i) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className="relative flex min-w-[2.6rem] flex-col items-center overflow-hidden rounded-lg bg-white/15 px-1.5 pb-0.5 pt-1 shadow-[inset_0_1px_0_rgb(255_255_255/.25)] ring-1 ring-white/25 backdrop-blur-sm">
              <span className="absolute inset-x-0 top-1/2 h-px bg-black/15" aria-hidden />
              <span key={v} className="font-mono text-[15px] font-black leading-none tabular-nums" style={{ animation: "sr-tick .35s ease both" }}>{pad(v)}</span>
              <span className="mt-0.5 text-[8px] font-bold uppercase leading-none tracking-[0.14em] text-white/70">{l}</span>
            </span>
            {i < 3 && <span className="-mt-2 text-sm font-black text-white/50">:</span>}
          </span>
        ))}
      </span>
    );
  }
  return (
    <div className="flex gap-3 sm:gap-4" role="timer" aria-label="Time left on the offer">
      {parts.map(([l, v]) => (
        <div key={l} className="min-w-[4.5rem] rounded-2xl bg-foreground px-3 py-3 text-center text-background shadow-xl shadow-primary/20 sm:min-w-[5.5rem] sm:px-4 sm:py-4">
          <p className="font-mono text-3xl font-black tabular-nums leading-none sm:text-5xl">{pad(v)}</p>
          <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.18em] opacity-70 sm:text-[11px]">{l}</p>
        </div>
      ))}
    </div>
  );
}
