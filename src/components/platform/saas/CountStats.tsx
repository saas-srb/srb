"use client";

import { useEffect, useRef, useState } from "react";

/** A row of big numbers that count up once when scrolled into view; separated by hairlines instead of boxes. */
export default function CountStats({ items }: { items: { v: string; l: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setOn(true); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setOn(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="grid grid-cols-2 lg:grid-cols-4">
      {items.map((s, i) => (
        <div key={s.l} className={`px-4 py-6 text-center ${i % 2 ? "border-l border-border/60" : ""} ${i > 1 ? "border-t border-border/60 lg:border-t-0" : ""} ${i === 2 ? "lg:border-l lg:border-border/60" : ""}`}>
          <p className="bg-gradient-to-br from-primary to-brand-accent bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl lg:text-6xl"><Num v={s.v} on={on} /></p>
          <p className="mx-auto mt-2 max-w-[14rem] text-sm font-medium text-muted-foreground">{s.l}</p>
        </div>
      ))}
    </div>
  );
}

/** Counts the first run of digits in the text from 0; leaves everything else as written. */
function Num({ v, on }: { v: string; on: boolean }) {
  const m = v.match(/^(\D*)(\d[\d,]*)(.*)$/);
  const target = m ? Number(m[2].replace(/,/g, "")) : 0;
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on || !m) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const p = still ? 1 : Math.min(1, (t - t0) / 1200); setN(Math.round(target * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);
  if (!m) return <>{v}</>;
  return <>{m[1]}{(on ? n : 0).toLocaleString("en-IN")}{m[3]}</>;
}
