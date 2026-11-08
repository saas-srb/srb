"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, BadgePercent, Gift, Infinity as InfinityIcon, PiggyBank, Star, X } from "lucide-react";
import Countdown from "@/components/platform/saas/Countdown";

export type AdSlide =
  | { kind: "launch"; label: string; pct: number; plan: string; plans: { name: string; price: string; list: string; pct: number }[] }
  | { kind: "plan"; name: string; price: string; list: string; save: string; pct: number; seats: string; popular: boolean }
  | { kind: "yearly"; plan: string; save: string; perMonth: string; monthly: string }
  | { kind: "free"; line: string };

const KEY = "sr-offer-ad-closed";
const QUIET = ["/offers", "/signup", "/login", "/register"];

/**
 * A small offer ad in the corner of every page: one real offer at a time (launch discount, a plan, the yearly saving, the free plan),
 * changing every few seconds, with the countdown and a claim link. The cross closes it for the rest of the browser session; a new session shows it again.
 */
export default function OfferAd({ slides, endsAt }: { slides: AdSlide[]; endsAt: number | null }) {
  const path = usePathname() || "/";
  const quiet = QUIET.some((q) => path === q || path.startsWith(`${q}/`));
  const [shown, setShown] = useState(false);
  const [closed, setClosed] = useState(true);
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let was = false;
    try { was = sessionStorage.getItem(KEY) === "1"; } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClosed(was);
    const t = window.setTimeout(() => setShown(true), 2500);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!shown || closed || hover || slides.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % slides.length), 6000);
    return () => window.clearInterval(t);
  }, [shown, closed, hover, slides.length]);

  const s = slides[i];
  if (!s || quiet || closed || !shown) return null;
  const close = () => { setClosed(true); try { sessionStorage.setItem(KEY, "1"); } catch {} };
  const Icon = s.kind === "free" ? InfinityIcon : s.kind === "yearly" ? PiggyBank : s.kind === "plan" ? (s.popular ? Star : Gift) : BadgePercent;
  const tag = s.kind === "launch" ? s.label : s.kind === "plan" ? (s.popular ? "Most chosen" : "Plan offer") : s.kind === "yearly" ? "Pay yearly" : "Free forever";

  return (
    <aside className="fixed bottom-4 left-4 z-[55] w-[min(20rem,calc(100vw-5.5rem))] sm:bottom-5 sm:left-5 sm:w-80" aria-label="Offer" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ animation: "sr-in .5s ease both" }}>
      <div className="sr-band relative overflow-hidden rounded-3xl p-4 shadow-[0_24px_60px_-18px_rgb(15_23_42/.55)]">
        <button type="button" onClick={close} aria-label="Close the offer" className="absolute right-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/30"><X className="h-3.5 w-3.5" /></button>
        <div key={i} style={{ animation: "sr-in .4s ease both" }}>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ring-1 ring-white/25"><Icon className="h-3 w-3" />{tag}</p>
          <p className="mt-2 pr-6 text-[15px] font-black leading-snug">
            {s.kind === "launch" && <>Save up to <span className="text-2xl">{s.pct}%</span> on every paid plan</>}
            {s.kind === "plan" && <>{s.name}: <span className="text-white/60 line-through">{s.list}</span> <span className="text-2xl">{s.price}</span>/mo</>}
            {s.kind === "yearly" && <>Pay yearly on {s.plan} — save <span className="text-2xl">{s.save}</span></>}
            {s.kind === "free" && <>Free forever — <span className="text-2xl">₹0</span> full access, AI included</>}
          </p>
        </div>
        {endsAt && <div className="mt-3"><Countdown endsAt={endsAt} variant="bar" /></div>}
        <Link href="/offers" className="group mt-3 flex items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-black text-[var(--primary)] shadow-lg transition-transform hover:scale-[1.03]">Claim the offer<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></Link>
        {slides.length > 1 && (
          <div className="mt-3 flex gap-1" aria-hidden>
            {slides.map((_, n) => <span key={n} className={`h-0.5 flex-1 rounded-full transition-colors ${n === i ? "bg-white" : "bg-white/25"}`} />)}
          </div>
        )}
      </div>
    </aside>
  );
}
