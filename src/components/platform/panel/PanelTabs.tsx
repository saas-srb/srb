"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The one tab design for every product: a rounded card-like track holding pill tabs, the active one tinted with the
 * brand colour and ringed like the Search & Filters card's icon. Scrolls sideways instead of wrapping on phones.
 * Use `PanelTabs` for link/button tab bars; `tabTrackClass` / `tabItemClass` are exported for the few places that need
 * their own element (the `ui/Tabs` primitives use them too).
 */
export const tabTrackClass =
  "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border/40 bg-card/90 p-1.5 shadow-sm backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function tabItemClass(active: boolean, disabled?: boolean) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
    disabled
      ? "cursor-not-allowed text-muted-foreground/40"
      : active
        ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
  );
}

export interface PanelTabItem {
  key: string;
  label: React.ReactNode;
  /** Navigates (link tab). Leave out and pass `onSelect` on the bar for in-page tabs. */
  href?: string;
  icon?: React.ReactNode;
  /** A small number shown after the label. */
  count?: number | string;
  disabled?: boolean;
  title?: string;
}

export function TabCount({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums", active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{children}</span>
  );
}

export default function PanelTabs({
  tabs,
  active,
  onSelect,
  className,
  label = "Sections",
}: {
  tabs: PanelTabItem[];
  active: string;
  onSelect?: (key: string) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn(tabTrackClass, className)}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        const inner = (
          <>
            {t.icon}
            {t.label}
            {t.count !== undefined && t.count !== "" && <TabCount active={isActive}>{t.count}</TabCount>}
          </>
        );
        const cls = tabItemClass(isActive, t.disabled);
        if (t.href && !t.disabled) {
          return (
            <Link key={t.key} href={t.href} role="tab" aria-selected={isActive} aria-current={isActive ? "page" : undefined} title={t.title} className={cls}>
              {inner}
            </Link>
          );
        }
        return (
          <button key={t.key} type="button" role="tab" aria-selected={isActive} disabled={t.disabled} title={t.title} onClick={() => !t.disabled && onSelect?.(t.key)} className={cls}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
