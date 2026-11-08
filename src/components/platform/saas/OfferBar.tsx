"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, BadgePercent, X } from "lucide-react";
import Countdown from "@/components/platform/saas/Countdown";

const KEY = "sr-offer-bar-closed";
const HIDE_FOR_MS = 24 * 60 * 60 * 1000;

/**
 * The strip above the header: what the offer is, how long is left (when the offer has an end date) and a way to claim it.
 * It can be closed; it stays closed for a day on this browser, and comes back at once when the offer changes.
 */
const EVENT = "sr-offer-bar-change";
let closedHere: string | null = null; // keeps it closed on this page even if the browser blocks storage
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
};
const wasClosed = (headline: string) => {
  if (closedHere === headline) return true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { headline: string; at: number } | null;
    return !!saved && saved.headline === headline && Date.now() - saved.at < HIDE_FOR_MS;
  } catch {
    return false;
  }
};

export default function OfferBar({ headline, sub, endsAt, cta, href }: { headline: string; sub: string; endsAt: number | null; cta: string; href: string }) {
  const closed = useSyncExternalStore(subscribe, () => wasClosed(headline), () => false);

  if (closed) return null;

  const close = () => {
    closedHere = headline;
    try { localStorage.setItem(KEY, JSON.stringify({ headline, at: Date.now() })); } catch {}
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <div className="sr-band relative z-[60] text-white" role="region" aria-label="Current offer">
      <div className="sr-container relative flex flex-wrap items-center justify-center gap-x-5 gap-y-2 py-2.5 pr-12 text-sm sm:pr-24">
        <span className="inline-flex items-center gap-2 font-black"><BadgePercent className="h-4 w-4 flex-none" /><span>{headline}</span></span>
        <span className="hidden text-white/80 md:inline">{sub}</span>
        {endsAt && <span className="inline-flex items-center gap-2"><span className="hidden text-xs font-bold uppercase tracking-wider text-white/75 sm:inline">Ends in</span><Countdown endsAt={endsAt} variant="bar" /></span>}
        <Link href={href} className="group inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-black text-[var(--primary)] shadow-lg transition-transform hover:scale-105">{cta}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></Link>
        <button type="button" onClick={close} aria-label="Close this offer" title="Close" className="group absolute right-2 top-1/2 flex h-8 -translate-y-1/2 items-center gap-1.5 rounded-full bg-white/10 px-2 text-xs font-bold text-white/85 ring-1 ring-white/20 transition-all hover:bg-white/25 hover:text-white hover:ring-white/40 sm:right-3 sm:px-3"><span className="hidden sm:inline">Close</span><X className="h-4 w-4 transition-transform group-hover:rotate-90" /></button>
      </div>
    </div>
  );
}
