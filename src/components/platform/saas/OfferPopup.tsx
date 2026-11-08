"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, BadgePercent, Check, X } from "lucide-react";
import Countdown from "@/components/platform/saas/Countdown";

const KEY = "sr-offer-popup-seen";
/** When it was last closed (localStorage): it stays away for a day after that, across reloads and new tabs. */
const CLOSED_KEY = "sr-offer-popup-closed-at";
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Shown once per page load, however many times the page re-renders or the pointer leaves the window. */
let shownThisLoad = false;

function recentlySeen(): boolean {
  try {
    if (sessionStorage.getItem(KEY) === "1") return true;
    const at = Number(localStorage.getItem(CLOSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < COOLDOWN_MS;
  } catch {
    return false;
  }
}
/** Pages where an offer pop-up would only get in the way. */
const QUIET = ["/offers", "/signup", "/login", "/register"];

export interface PopupPlan { name: string; price: string; list: string; pct: number }

/**
 * The offer pop-up: it opens a few seconds after someone lands on any page (or when the pointer leaves towards the browser's top
 * edge), once per browser session (it comes back in a new session), and never on the offers, sign-up or log-in pages. Escape or a click outside closes it.
 */
export default function OfferPopup({ label, topPct, plans, endsAt, freeLine }: { label: string; topPct: number; plans: PopupPlan[]; endsAt: number | null; freeLine: string }) {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    try { localStorage.setItem(CLOSED_KEY, String(Date.now())); } catch {}
  };
  const quiet = QUIET.some((q) => path === q || path.startsWith(`${q}/`));

  useEffect(() => {
    if (quiet || shownThisLoad || recentlySeen()) return;
    let armed = false;
    const timer = window.setTimeout(() => { armed = true; show(); }, 8000);
    // Leaving through the top edge (towards the tabs) counts only for a real mouse, and only after a few seconds on the page.
    const arm = window.setTimeout(() => { armed = true; }, 5000);
    function show() {
      if (shownThisLoad) return;
      shownThisLoad = true;
      cleanup();
      setOpen(true);
      try { sessionStorage.setItem(KEY, "1"); } catch {}
    }
    const onLeave = (e: MouseEvent) => { if (armed && e.clientY <= 0 && !e.relatedTarget) show(); };
    function cleanup() { window.clearTimeout(timer); window.clearTimeout(arm); document.removeEventListener("mouseout", onLeave); }
    document.addEventListener("mouseout", onLeave);
    return cleanup;
  }, [quiet, path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.documentElement.style.overflow = prev; };
  }, [open]);

  if (!open || quiet) return null;
  return (
    <div className="fixed inset-0 z-[90] flex justify-center overflow-y-auto overscroll-contain bg-black/60 p-3 backdrop-blur-sm sm:p-4" onClick={() => close()} role="dialog" aria-modal="true" aria-label="Current offer" style={{ animation: "sr-in .3s ease both" }}>
      <div className="relative my-auto w-full max-w-lg overflow-hidden rounded-[1.75rem] bg-background shadow-[0_50px_120px_-20px_rgb(0_0_0/.6)] sm:rounded-[2rem]" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => close()} aria-label="Close" className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur hover:bg-black/40"><X className="h-5 w-5" /></button>
        <div className="sr-band px-6 pb-7 pt-9 text-center sm:px-8 sm:pb-9 sm:pt-10 [@media(max-height:760px)]:pb-6 [@media(max-height:760px)]:pt-8">
          <span className="relative inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] ring-1 ring-white/30"><BadgePercent className="h-4 w-4" />{label}</span>
          {topPct > 0 ? (
            <>
              <p className="relative mt-4 text-6xl font-black leading-none tracking-tighter sm:text-8xl [@media(max-height:760px)]:text-6xl">{topPct}<span className="text-4xl sm:text-5xl">% off</span></p>
              <p className="relative mt-2 text-lg font-semibold text-white/85">on every paid plan — every product and feature included</p>
            </>
          ) : (
            <>
              <p className="relative mt-4 text-5xl font-black leading-tight tracking-tight">Free forever</p>
              <p className="relative mt-2 text-lg font-semibold text-white/85">{freeLine}</p>
            </>
          )}
          {endsAt && <div className="relative mt-5 flex flex-col items-center gap-2"><span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">Offer ends in</span><Countdown endsAt={endsAt} variant="bar" /></div>}
        </div>
        <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-6">
          {plans.length > 0 && (
            <ul className="mb-5 divide-y [@media(max-height:620px)]:hidden divide-border/60 rounded-2xl border border-border/60">
              {plans.slice(0, 3).map((p) => (
                <li key={p.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
                  <span className="flex items-center gap-2.5 font-bold"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>{p.name}</span>
                  <span className="flex items-baseline gap-1.5 sm:gap-2"><span className="text-sm text-muted-foreground line-through">{p.list}</span><span className="text-lg font-black">{p.price}</span><span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-black text-emerald-600">−{p.pct}%</span></span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/signup" onClick={() => close()} className="group flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-4 text-base font-black text-background shadow-xl transition-transform hover:scale-[1.02]">Claim the offer<ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></Link>
          <div className="mt-3 flex items-center justify-between text-sm">
            <Link href="/offers" onClick={() => close()} className="font-bold text-primary hover:underline">See all offers</Link>
            <button type="button" onClick={() => close()} className="text-muted-foreground hover:text-foreground">Maybe later</button>
          </div>
        </div>
      </div>
    </div>
  );
}
