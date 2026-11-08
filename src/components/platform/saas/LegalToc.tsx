"use client";

import { useEffect, useState } from "react";

/** "On this page": the section being read is highlighted as you scroll. */
export default function LegalToc({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: "-20% 0px -65% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  return (
    <ul className="space-y-0.5 border-l border-border/70">
      {items.map((t, i) => (
        <li key={t.id}>
          <a href={`#${t.id}`} className={`-ml-px flex gap-2.5 border-l-2 py-1.5 pl-4 text-sm transition-colors ${active === t.id ? "border-primary font-bold text-primary" : "border-transparent text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>
            <span className="w-5 flex-none text-xs tabular-nums opacity-60">{String(i + 1).padStart(2, "0")}</span>{t.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
