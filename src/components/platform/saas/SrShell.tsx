"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * The element that carries the product's colours (`.sr`). Its dark state follows the class on <html> — the one place the theme lives
 * (set before paint by next-themes, changed by the website's switch or a product's theme setting) — so a page reached by a client-side
 * move from another layout (the website to sign-up, say) opens in the same theme instead of falling back to light.
 */
export default function SrShell({ script, children }: { script: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const sync = () => {
      const dark = root.classList.contains("dark");
      el.classList.toggle("dark", dark);
      if (dark) el.setAttribute("data-theme", "dark"); else el.removeAttribute("data-theme");
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return (
    <div ref={ref} className="sr" suppressHydrationWarning>
      {script}
      {children}
    </div>
  );
}
