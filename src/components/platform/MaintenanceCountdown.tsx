"use client";

import { useEffect, useState } from "react";

/** Time left to `target` (epoch ms), ticking every second. Starts at null so the server HTML and the first client render agree. */
export function useCountdown(target: number): { total: number; days: number; hours: number; minutes: number; seconds: number } | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const total = Math.max(0, target - now);
  const s = Math.floor(total / 1000);
  return { total, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "01:23:45" (with a days part when there is one), for the banner. */
export function formatCountdown(c: NonNullable<ReturnType<typeof useCountdown>>): string {
  return `${c.days > 0 ? `${c.days}d ` : ""}${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`;
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="mt-tile">
      <span key={value} className="mt-digit">{pad(value)}</span>
      <span className="mt-label">{label}</span>
    </div>
  );
}

/**
 * The big countdown of the maintenance screen: tiles that roll over each second. When it reaches zero it reloads the page every few
 * seconds until the site answers again (the server lets everyone back in on its own at the end time).
 */
export default function MaintenanceCountdown({ endsAt }: { endsAt: number }) {
  const c = useCountdown(endsAt);
  const ended = c !== null && c.total <= 0;
  useEffect(() => {
    if (!ended) return;
    const t = setTimeout(() => location.reload(), 2500 + Math.random() * 3500);
    return () => clearTimeout(t);
  }, [ended]);
  if (!c) return <div className="mt-countdown" aria-hidden style={{ visibility: "hidden" }}><Tile value={0} label="hours" /></div>;
  if (ended) return <p className="app-fade text-sm font-semibold text-primary" role="status">We’re finishing up — reopening in a moment…</p>;
  return (
    <div className="mt-countdown" role="timer" aria-label="Time until we are back">
      {c.days > 0 && <Tile value={c.days} label="days" />}
      <Tile value={c.hours} label="hours" />
      <span className="mt-colon" aria-hidden>:</span>
      <Tile value={c.minutes} label="minutes" />
      <span className="mt-colon" aria-hidden>:</span>
      <Tile value={c.seconds} label="seconds" />
    </div>
  );
}
