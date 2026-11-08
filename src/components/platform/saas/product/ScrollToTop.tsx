"use client";

import { useEffect } from "react";

const FLAG = "sr-product-hop";

/**
 * Moving between products (sidebar, previous/next) skips the hero banner and lands on the section menu.
 * Arriving from anywhere else, such as the products listing, shows the page from the top, hero included.
 */
export default function ScrollToTop({ pageKey }: { pageKey: string }) {
  useEffect(() => {
    const mark = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.("a[data-product-link]")) {
        try { sessionStorage.setItem(FLAG, "1"); } catch { /* storage blocked: the hero simply shows */ }
      }
    };
    document.addEventListener("click", mark, true);
    return () => document.removeEventListener("click", mark, true);
  }, []);

  useEffect(() => {
    let hop = false;
    try { hop = sessionStorage.getItem(FLAG) === "1"; sessionStorage.removeItem(FLAG); } catch { /* ignore */ }
    if (!hop || window.location.hash) return;
    const go = () => {
      const nav = document.querySelector("[data-product-nav], [data-hop-target]");
      if (!nav) return;
      const cs = getComputedStyle(nav);
      const offset = cs.position === "sticky" ? (parseFloat(cs.top) || 0) - 24 : Number((nav as HTMLElement).dataset.hopOffset) || 100;
      window.scrollTo({ top: nav.getBoundingClientRect().top + window.scrollY - offset, left: 0, behavior: "instant" });
    };
    // the router also scrolls after a navigation, so land again once it has settled
    go();
    const timers = [window.setTimeout(go, 50), window.setTimeout(go, 200)];
    return () => timers.forEach(window.clearTimeout);
  }, [pageKey]);
  return null;
}
