"use client";

import { Children, isValidElement } from "react";

/**
 * A section of a product sidebar: its heading and the items under it. Items a person may not use render nothing (owner rule 2026-11-17: hidden, not
 * greyed), and a section with nothing left to show disappears with its heading.
 */
export default function NavGroup({ label, collapsed = false, children }: { label: string; collapsed?: boolean; children: React.ReactNode }) {
  const shown = Children.toArray(children).filter((c) => isValidElement(c));
  if (shown.length === 0) return null;
  return (
    <>
      {collapsed ? <div className="mt-4 mb-1 border-t border-border/50" /> : <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</div>}
      {shown}
    </>
  );
}
