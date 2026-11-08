"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

/** Page-wide polish: a scroll-progress bar, a back-to-top button and the cursor spotlight on cards. Presentation only. */
export default function Interactions() {
  const bar = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        bar.current?.style.setProperty("--p", String(h > 0 ? Math.min(1, window.scrollY / h) : 0));
        setTop(window.scrollY > 700);
      });
    };
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".border, .sr-card");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <>
      <div ref={bar} className="sr-progress" aria-hidden />
      <button type="button" aria-label="Back to top" className={`sr-top ${top ? "on" : ""}`} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <ArrowUp className="h-5 w-5" />
      </button>
    </>
  );
}
