"use client";

import Link from "next/link";
import { Bell, X } from "lucide-react";
import { dismissToast, type Toast } from "@/lib/notify/client";
import { usePanelLabel } from "@/components/platform/PanelsProvider";

/** The small "new notification" cards in the corner. Rendered once per page by the first bell on it. */
export default function NotificationToasts({ toasts }: { toasts: Toast[] }) {
  const label = usePanelLabel();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-3 top-16 z-[1100] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.key} className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-border/70 bg-background p-3 shadow-xl">
          <span className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-full bg-primary/10 text-primary"><Bell className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label(t.panel, t.panel.toUpperCase())}</p>
            {t.item.link ? (
              <Link href={t.item.link} onClick={() => dismissToast(t.key)} className="block truncate text-sm font-semibold text-foreground hover:text-primary">{t.item.title}</Link>
            ) : (
              <p className="truncate text-sm font-semibold text-foreground">{t.item.title}</p>
            )}
            {t.item.body && <p className="line-clamp-2 text-xs text-muted-foreground">{t.item.body}</p>}
          </div>
          <button type="button" onClick={() => dismissToast(t.key)} aria-label="Dismiss" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>
        </div>
      ))}
    </div>
  );
}
