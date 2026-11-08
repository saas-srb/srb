"use client";

import { createContext, useContext } from "react";
import type { PanelMeta } from "@/lib/platform/panels/types";
import ProductLauncher from "@/components/platform/ProductLauncher";
import ProductLogo from "@/components/products/ProductLogo";

const PanelsContext = createContext<Record<string, PanelMeta>>({});

/** Provided once in the root layout with the Product Registry as it applies to the current company. */
export function PanelsProvider({ panels, children }: { panels: Record<string, PanelMeta>; children: React.ReactNode }) {
  return <PanelsContext.Provider value={panels}>{children}</PanelsContext.Provider>;
}

export function usePanels(): Record<string, PanelMeta> {
  return useContext(PanelsContext);
}

export function usePanelMeta(key: string): PanelMeta | null {
  return useContext(PanelsContext)[key] ?? null;
}

/** The shared header action used to switch between the products in the registry. */
export function ProductLauncherForPanel({ panel }: { panel: string }) {
  const panels = usePanels();
  const meta = usePanelMeta(panel);
  return meta ? <ProductLauncher currentPanel={panel} products={Object.values(panels)} /> : null;
}

/** The title + description every product shows in its top bar — read from the Product Registry, so one edit changes it everywhere. */
export function PanelHeading({ panel, fallbackTitle, fallbackDescription, className = "min-w-0 flex-1 md:flex-none" }: { panel: string; fallbackTitle?: string; fallbackDescription?: string; className?: string }) {
  const meta = usePanelMeta(panel);
  return (
      <div className={`${className} flex min-w-0 items-center gap-2.5`}>
        {meta && <ProductLogo productKey={panel} size={34} title={meta.name} className="shrink-0 shadow-sm" />}
        <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground" title={meta?.headerTitle ?? fallbackTitle ?? panel}>{meta?.headerTitle ?? fallbackTitle ?? panel}</p>
        <p className="truncate text-[11px] text-muted-foreground" title={meta?.headerDescription ?? fallbackDescription ?? ""}>{meta?.headerDescription ?? fallbackDescription ?? ""}</p>
        </div>
      </div>
  );
}

/** Just the product's registry name, for headings and labels in server-rendered pages. */
export function PanelName({ panel, fallback }: { panel: string; fallback: string }) {
  return <>{usePanelMeta(panel)?.name ?? fallback}</>;
}

/** Older module keys some logs and records still carry, mapped to their Product Registry key. */
const KEY_ALIASES: Record<string, string> = { teamchat: "messenger", admin: "workspace" };

/**
 * A function that turns a product / module key into its registry name, falling back to the label the caller already has.
 * For client screens that list a module column or filter (documents, activity log, SOP links …).
 */
export function usePanelLabel(): (key: string, fallback?: string) => string {
  const panels = useContext(PanelsContext);
  return (key, fallback) => panels[KEY_ALIASES[key] ?? key]?.name ?? fallback ?? key;
}
