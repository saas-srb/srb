"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Eye, X } from "lucide-react";

/** Messages between the theme customizer (parent window) and the previewed site (this iframe). */
export const PREVIEW_MSG = { fromSite: "cms-theme-preview", fromCustomizer: "cms-theme-customizer" } as const;

export type CustomizerPayload = { type: "css"; css: string } | { type: "mode"; mode: "light" | "dark" };
export type CustomizerMessage = CustomizerPayload & { source: typeof PREVIEW_MSG.fromCustomizer };

/**
 * Rendered by the site layout only while a CMS user is previewing a theme.
 * Inside the customizer's iframe it applies the customizer's unsaved edits
 * instantly (CSS swap, light/dark) and reports which page is showing. Opened
 * directly in a tab, it shows a small "previewing" pill with an exit button,
 * so a preview can never silently stick to someone's normal browsing.
 */
export default function ThemePreviewBridge({ themeName }: { themeName: string }) {
  const pathname = usePathname();
  const [framed, setFramed] = useState(true);

  useEffect(() => {
    const isFramed = window.parent !== window;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- only knowable in the browser
    setFramed(isFramed);
    if (!isFramed) return;
    window.parent.postMessage({ source: PREVIEW_MSG.fromSite, type: "ready", path: location.pathname + location.search, title: document.title }, location.origin);
  }, [pathname]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== window.parent) return;
      const msg = e.data as CustomizerMessage;
      if (msg?.source !== PREVIEW_MSG.fromCustomizer) return;
      if (msg.type === "css") {
        const style = document.getElementById("cms-theme-vars");
        if (style) style.textContent = msg.css;
      } else if (msg.type === "mode") {
        const root = document.documentElement;
        root.classList.toggle("dark", msg.mode === "dark");
        root.classList.toggle("light", msg.mode === "light");
        root.style.colorScheme = msg.mode;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (framed) return null;

  const exit = async () => {
    await fetch("/api/sitecraft-ai/theme-preview/exit", { method: "POST" }).catch(() => null);
    location.reload();
  };

  return (
    <div className="fixed bottom-4 left-4 z-[100] flex items-center gap-2 rounded-full border border-border bg-background/95 py-1.5 pr-1.5 pl-3 text-xs font-medium text-foreground shadow-lg backdrop-blur">
      <Eye className="size-3.5 text-primary" />
      Previewing theme: {themeName}
      <button type="button" onClick={exit} className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-background hover:opacity-90">
        <X className="size-3" /> Exit preview
      </button>
    </div>
  );
}
