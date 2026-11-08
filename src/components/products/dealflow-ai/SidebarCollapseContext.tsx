"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "admin-sidebar-collapsed";

interface SidebarCollapseContextValue {
  collapsed: boolean;
  toggle: () => void;
  /** False until the post-mount localStorage read completes — used to skip the
   * width-collapse spring animation on first paint so it doesn't visibly snap. */
  hydrated: boolean;
  /** The product's bottom profile block, registered by the desktop sidebar so the mobile drawer can show it too. */
  mobileProfile: ReactNode;
  setMobileProfile: (node: ReactNode) => void;
}

const SidebarCollapseContext = createContext<SidebarCollapseContextValue | null>(null);

export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mobileProfile, setMobileProfile] = useState<ReactNode>(null);

  useEffect(() => {
    // Reads localStorage post-mount (client-only) so the server-rendered/first-paint
    // markup always matches (expanded), avoiding a hydration mismatch.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // localStorage unavailable — default to expanded.
    }
    setHydrated(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Non-fatal — collapse state just won't persist across reloads.
      }
      return next;
    });
  }

  return (
    <SidebarCollapseContext.Provider value={{ collapsed, toggle, hydrated, mobileProfile, setMobileProfile }}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

export function useSidebarCollapse(): SidebarCollapseContextValue {
  const ctx = useContext(SidebarCollapseContext);
  if (!ctx) throw new Error("useSidebarCollapse must be used within a SidebarCollapseProvider");
  return ctx;
}

/** Wraps a sidebar's profile menu: renders it in place and hands a copy to the mobile drawer (which the desktop-only sidebar can't reach). */
export function SidebarProfileSlot({ children }: { children: ReactNode }) {
  const { setMobileProfile } = useSidebarCollapse();
  useEffect(() => {
    setMobileProfile(children);
    return () => setMobileProfile(null);
    // Registered once per mount: the profile's props are fixed for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

/** The bottom profile block inside a product's mobile drawer, always expanded (never the collapsed icon-only form). */
export function MobileSidebarProfile() {
  const ctx = useSidebarCollapse();
  if (!ctx.mobileProfile) return null;
  return (
    <SidebarCollapseContext.Provider value={{ ...ctx, collapsed: false }}>
      <div className="shrink-0">{ctx.mobileProfile}</div>
    </SidebarCollapseContext.Provider>
  );
}
