"use client";

import { useEffect, useState } from "react";

/** A page's sticky section menu that follows the reader: the section on screen is lit, and the menu scrolls to keep it in view. */
export default function SectionScrollNav({ items, label, numbered = false, compact = false }: { items: { id: string; label: string }[]; label: string; numbered?: boolean; compact?: boolean }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-146px 0px -55% 0px", threshold: 0 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-snav="${active}"]`);
    const box = el?.parentElement;
    if (el && box) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" });
  }, [active]);

  return (
    <nav data-hop-target aria-label={label} className="sticky top-[76px] z-40 border-b border-border/50 bg-background/85 backdrop-blur-xl">
      <div className={`sr-container sr-scroll-x relative flex py-3 ${compact ? "gap-0.5 xl:justify-between" : "gap-1.5"}`}>
        {items.map((s, i) => (
          <a key={s.id} href={`#${s.id}`} data-snav={s.id} aria-current={active === s.id ? "true" : undefined} className={`shrink-0 whitespace-nowrap rounded-full py-1.5 font-semibold transition-all ${compact ? "px-2.5 text-[13px]" : "px-3.5 text-sm"} ${active === s.id ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}>
            {numbered && <span className={`${compact ? "mr-1" : "mr-1.5"} ${active === s.id ? "text-primary-foreground/80" : "text-primary"}`}>{String(i + 1).padStart(2, "0")}</span>}{s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
