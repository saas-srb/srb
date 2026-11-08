"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, GripHorizontal, PlayCircle, Sparkles, X } from "lucide-react";

/** Closed for this page load only: a reload (or a new visit) shows it again; moving between pages does not. */
let closedThisLoad = false;
/** Pages where an ad would get in the way. */
const QUIET = ["/signup", "/login", "/register", "/contact"];
const LINES = [
  { tag: "Free forever", body: "Every product and feature. AI built in. No card." },
  { tag: "Start at ₹0", body: "Independent products for sales, HR, finance and more — free." },
  { tag: "Try it free", body: "Set up in minutes. Full access, no card needed." },
];
const W = 232;

/**
 * A small "Free forever" card that floats in at a random place (never the bottom) and a random moment, bobs gently, can be dragged anywhere
 * and closed with the X; once closed it stays away until the page is reloaded. It waits for any open pop-up to be closed first.
 */
export default function FreeForeverToast() {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [line] = useState(() => LINES[Math.floor(Math.random() * LINES.length)]);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (closedThisLoad) return;
    let poll = 0;
    const t = window.setTimeout(() => {
      const show = () => {
        if (document.querySelector('[role="dialog"]')) return;
        window.clearInterval(poll);
        const w = window.innerWidth, h = window.innerHeight, wide = Math.min(W, w - 24);
        const left = Math.random() < 0.5;
        setPos({ x: left ? 12 : Math.max(12, w - wide - 12), y: Math.round(110 + Math.random() * Math.max(40, h * 0.42 - 110)) });
        setOpen(true);
      };
      poll = window.setInterval(show, 1500);
      show();
    }, 6000 + Math.random() * 12000);
    return () => { window.clearTimeout(t); window.clearInterval(poll); };
  }, [path]);

  if (!open || !pos || QUIET.some((q) => path === q || path.startsWith(`${q}/`))) return null;
  const close = () => { closedThisLoad = true; setOpen(false); };
  const down = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("a,button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false };
  };
  const move = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const w = Math.min(W, window.innerWidth - 24);
    setPos({ x: Math.min(Math.max(8, e.clientX - d.dx), window.innerWidth - w - 8), y: Math.min(Math.max(8, e.clientY - d.dy), window.innerHeight - 150) });
  };
  const up = () => { drag.current = null; };

  return (
    <aside
      className="fixed z-[54] touch-none select-none"
      style={{ left: pos.x, top: pos.y, width: Math.min(W, typeof window === "undefined" ? W : window.innerWidth - 24) }}
      aria-label="Free plan"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <style>{`
        @keyframes sr-ff-in{from{opacity:0;transform:scale(.8) translateY(-14px)}to{opacity:1;transform:none}}
        @keyframes sr-ff-bob{0%,100%{transform:translateY(0) rotate(-.6deg)}50%{transform:translateY(-7px) rotate(.6deg)}}
        @keyframes sr-ff-shine{0%{transform:translateX(-120%) skewX(-20deg)}60%,100%{transform:translateX(260%) skewX(-20deg)}}
        @keyframes sr-ff-glow{0%,100%{box-shadow:0 18px 50px -12px rgba(16,185,129,.65),0 0 0 0 rgba(52,211,153,.5)}50%{box-shadow:0 22px 60px -10px rgba(16,185,129,.8),0 0 0 8px rgba(52,211,153,0)}}
        @media (prefers-reduced-motion:reduce){.sr-ff *{animation:none!important}}
      `}</style>
      <div className="sr-ff" style={{ animation: "sr-ff-in .6s cubic-bezier(.2,.9,.3,1) both" }}>
        <div className="relative cursor-grab overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-emerald-400 to-teal-500 p-4 text-emerald-950 ring-1 ring-white/70 active:cursor-grabbing" style={{ animation: "sr-ff-bob 4.5s ease-in-out infinite, sr-ff-glow 2.8s ease-in-out infinite" }}>
          <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/40 blur-md" style={{ animation: "sr-ff-shine 3.6s ease-in-out infinite" }} aria-hidden />
          <span className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/30 blur-xl" aria-hidden />
          <button type="button" onClick={close} aria-label="Close" className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-950/15 transition-colors hover:bg-emerald-950/30"><X className="h-3.5 w-3.5" /></button>
          <p className="relative flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em]"><Sparkles className="h-3.5 w-3.5" />{line.tag}</p>
          <p className="relative mt-1 flex items-baseline gap-1.5"><span className="text-4xl font-black leading-none tracking-tighter">₹0</span><span className="text-sm font-black">forever</span></p>
          <p className="relative mt-1.5 text-[12px] font-semibold leading-snug">{line.body}</p>
          <Link href="/signup" onClick={close} className="group relative mt-3 flex items-center justify-center gap-1.5 rounded-full bg-emerald-950 px-4 py-2 text-xs font-black text-white transition-transform hover:scale-[1.04]">Start free <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></Link>
          <Link href="/demo" onClick={close} className="relative mt-2 flex items-center justify-center gap-1.5 rounded-full border border-emerald-950/30 bg-white/45 px-4 py-2 text-xs font-black text-emerald-950 transition-colors hover:bg-white/70"><PlayCircle className="h-3.5 w-3.5" />See live demo</Link>
          <GripHorizontal className="relative mx-auto mt-2 h-3.5 w-3.5 opacity-50" aria-label="Drag to move" />
        </div>
      </div>
    </aside>
  );
}
