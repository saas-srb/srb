"use client";

import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { LiveView } from "@/lib/products/agentos/calls/live";

export type LiveLine = LiveView["events"][number];

const STYLE = {
  lead: { name: "Lead", box: "border-sky-500/30 bg-sky-500/8", tag: "text-sky-700 dark:text-sky-300" },
  ai: { name: "AI", box: "border-violet-500/30 bg-violet-500/8", tag: "text-violet-700 dark:text-violet-300" },
  human: { name: "Team", box: "border-emerald-500/30 bg-emerald-500/8", tag: "text-emerald-700 dark:text-emerald-300" },
} as const;

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" });

/** The running transcript. Follows new lines unless the reader scrolled up; then offers a way back to the latest. */
export default function LiveTranscript({ lines, viewerId }: { lines: LiveLine[]; viewerId: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    const el = box.current;
    if (el && pinned) el.scrollTop = el.scrollHeight;
  }, [lines, pinned]);

  return (
    <div className="relative">
      <div
        ref={box}
        onScroll={(e) => { const el = e.currentTarget; setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 48); }}
        className="h-[min(60vh,32rem)] space-y-2 overflow-y-auto rounded-xl border border-border bg-background p-3"
        aria-live="polite"
        aria-label="Live transcript"
      >
        {lines.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing has been said yet. Lines appear here a moment after they are spoken.</p>}
        {lines.map((l) => {
          const s = l.speaker ? STYLE[l.speaker] : null;
          if (!s) {
            return <p key={l.seq} className="text-center text-xs text-muted-foreground">{l.type === "note" ? `Note to the AI: ${l.text}` : l.text} <span className="opacity-60">· {clock(l.at)}</span></p>;
          }
          return (
            <div key={l.seq} className={cn("max-w-[85%] rounded-xl border px-3 py-2 text-sm", s.box, l.speaker === "lead" ? "mr-auto" : "ml-auto")}>
              <p className={cn("mb-0.5 text-[11px] font-bold uppercase tracking-wide", s.tag)}>{l.speaker === "human" && l.by === viewerId ? "You" : s.name} <span className="font-normal normal-case opacity-60">· {clock(l.at)}</span></p>
              <p className="whitespace-pre-wrap break-words">{l.text}</p>
            </div>
          );
        })}
      </div>
      {!pinned && (
        <button type="button" onClick={() => { setPinned(true); const el = box.current; if (el) el.scrollTop = el.scrollHeight; }} className="absolute bottom-3 right-4 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow">
          <ArrowDown className="size-3" />Latest
        </button>
      )}
    </div>
  );
}
