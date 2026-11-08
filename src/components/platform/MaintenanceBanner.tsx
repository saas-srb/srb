"use client";

import { Wrench } from "lucide-react";
import { formatCountdown, useCountdown } from "@/components/platform/MaintenanceCountdown";

/**
 * The platform-wide maintenance banner on every company's site and products: before the window it announces it with a countdown to the
 * start; during a banner-mode window it counts down to the end. It disappears by itself when the window is over (the next page view no
 * longer renders it; a page left open hides it at zero). On a website it is sticky at the top; in the products (fixed-height screens) it floats at the bottom so no layout shifts. Themed with the company's own colours, animated.
 */
export default function MaintenanceBanner({ surface, phase, message, startsAt, endsAt }: { surface: "site" | "app"; phase: "upcoming" | "active"; message: string; startsAt: number; endsAt: number }) {
  const target = phase === "upcoming" ? startsAt : endsAt;
  const c = useCountdown(target);
  if (c && c.total <= 0 && phase === "active") return null;
  const when = new Date(startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div role="status" className={surface === "app" ? "mt-banner mt-banner-float" : "mt-banner"}>
      <span className="mt-banner-icon" aria-hidden><Wrench className="size-4" /></span>
      <p className="min-w-0 flex-1 text-sm">
        <strong className="font-bold">{phase === "upcoming" ? "Scheduled maintenance" : "Maintenance in progress"}</strong>
        {message ? <span className="ml-2 opacity-90">{message}</span> : null}
        {phase === "upcoming" ? <span className="ml-2 hidden opacity-80 md:inline" suppressHydrationWarning>· starts {when}</span> : null}
      </p>
      <span className="mt-banner-time" aria-label={phase === "upcoming" ? "Starts in" : "Ends in"}>
        <span className="mt-banner-dot" aria-hidden />
        {phase === "upcoming" ? "Starts in" : "Ends in"} <b suppressHydrationWarning>{c ? formatCountdown(c) : "--:--:--"}</b>
      </span>
    </div>
  );
}
