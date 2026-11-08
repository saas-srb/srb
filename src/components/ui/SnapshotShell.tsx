"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const SHELL_KEY = "app-shell-last";

/**
 * Takes a copy of the product the person is looking at (its sidebar and header, with the page area emptied) just before they open another
 * product. Called from `NavigationProgress` on the click. The copy is plain HTML in sessionStorage; nothing sensitive is in a sidebar's markup
 * beyond what is on screen, and it is only ever shown to the same person in the same tab.
 */
export function captureShell(): void {
  try {
    const aside = document.querySelector("aside");
    const root = aside?.parentElement;
    if (!aside || !root || !root.querySelector("main")) return;
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, iframe, canvas, [role='dialog'], [data-nextjs-toast]").forEach((n) => n.remove());
    const main = clone.querySelector("main");
    if (main) main.innerHTML = '<div data-shell-slot style="height:100%"></div>';
    const html = clone.outerHTML;
    if (html.length < 400_000) sessionStorage.setItem(SHELL_KEY, html);
  } catch {
    // storage full / blocked: the plain loading frame is used instead
  }
}

/**
 * The product-opening screen after the app has already been on screen: the sidebar and header of the product the person just left stay exactly
 * as they were (a copy taken by `captureShell`), and only the page area shows the loader. With no copy (first navigation of the tab, storage
 * blocked) it shows `fallback`. The first render is always `fallback`, so server HTML and hydration agree.
 */
export default function SnapshotShell({ fallback, loader }: { fallback: ReactNode; loader: ReactNode }) {
  const [html, setHtml] = useState<string | null>(null);
  const [slot, setSlot] = useState<Element | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    try {
      setHtml(sessionStorage.getItem(SHELL_KEY));
    } catch {
      setHtml(null);
    }
  }, []);
  useEffect(() => {
    if (html && ref.current) setSlot(ref.current.querySelector("[data-shell-slot]"));
  }, [html]);

  if (!html) return <>{fallback}</>;
  return (
    <div className="fixed inset-0 z-50 bg-canvas" aria-busy="true">
      <div ref={ref} className="pointer-events-none" dangerouslySetInnerHTML={{ __html: html }} />
      {slot ? createPortal(loader, slot) : null}
    </div>
  );
}
