"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

/** The product page's sticky menu: it follows the reader (the section on screen lights up) and shows how far down the page they are. */
export default function ProductScrollNav({ items, name }: { items: { id: string; label: string }[]; name: string }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: 0 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  // keep the lit tab in view on small screens
  useEffect(() => {
    document.querySelector(`[data-pnav="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  return (
    <nav data-product-nav aria-label={`${name} sections`} className="sticky top-[76px] z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="sr-container sr-scroll-x flex items-center gap-1 py-2.5">
        <Link href="/products" className="sr-tab inline-flex shrink-0 items-center gap-1.5"><ArrowLeft className="h-3.5 w-3.5" />All products</Link>
        <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
        {items.map((s) => (
          <a key={s.id} href={`#${s.id}`} data-pnav={s.id} aria-current={active === s.id ? "true" : undefined} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all ${active === s.id ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}>{s.label}</a>
        ))}
      </div>
    </nav>
  );
}
