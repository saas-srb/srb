"use client";

import { useState } from "react";
import { ChevronDown, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Person {
  userId: string;
  name: string;
  readAt?: string;
}

export default function AnnouncementReadStats({
  total,
  read,
  readers,
  unread,
}: {
  total: number;
  read: number;
  readers: Person[];
  unread: Person[];
}) {
  const [open, setOpen] = useState(false);
  const pct = total > 0 ? Math.round((read / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left text-sm">
        <CheckCheck className="size-4 text-primary" />
        <span className="font-medium text-foreground">
          {read} of {total} confirmed ({pct}%)
        </span>
        <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-brand-accent" style={{ width: `${pct}%` }} />
      </div>

      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Confirmed</p>
            <ul className="space-y-0.5 text-sm">
              {readers.length === 0 && <li className="text-muted-foreground">Nobody yet.</li>}
              {readers.map((r) => (
                <li key={r.userId} className="flex items-center justify-between gap-2">
                  <span className="truncate">{r.name}</span>
                  {r.readAt && <span className="shrink-0 text-[11px] text-muted-foreground">{new Date(r.readAt).toLocaleDateString()}</span>}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Not yet</p>
            <ul className="space-y-0.5 text-sm">
              {unread.length === 0 && <li className="text-muted-foreground">Everyone confirmed 🎉</li>}
              {unread.map((r) => (
                <li key={r.userId} className="truncate text-muted-foreground">
                  {r.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
