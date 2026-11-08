"use client";

import { useState } from "react";

/** Tabs inside a section: one panel at a time, so a long section reads as a few short ones. Panels are drawn on the server and passed in. */
export default function ExtrasTabs({ tabs }: { tabs: { id: string; label: string; count?: number; icon: React.ReactNode; node: React.ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  if (!current) return null;
  return (
    <div>
      <div role="tablist" aria-label="Smart extras" className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-muted/60 p-1.5">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={active === t.id} aria-controls={`panel-${t.id}`} onClick={() => setActive(t.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${active === t.id ? "bg-background text-primary shadow-md" : "text-muted-foreground hover:text-foreground"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`} key={current.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">{current.node}</div>
    </div>
  );
}
