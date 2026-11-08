"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/products/agentos/voice/call-format";

export interface TranscriptLine {
  /** Display name of who spoke ("Lead", the agent's name, "Team member"). */
  speaker: string;
  kind: "lead" | "ai" | "human";
  atSecs: number | null;
  text: string;
}

const KIND_STYLE = { lead: "text-sky-700 dark:text-sky-300", ai: "text-violet-700 dark:text-violet-300", human: "text-emerald-700 dark:text-emerald-300" } as const;

/** A call transcript: timestamp, speaker label and words, with a search box that narrows the lines to those matching the words or the speaker. */
export default function CallTranscript({ lines, searchable = true }: { lines: readonly TranscriptLine[]; searchable?: boolean }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? lines.filter((l) => l.text.toLowerCase().includes(needle) || l.speaker.toLowerCase().includes(needle)) : lines;
  }, [lines, q]);
  return (
    <div className="space-y-3">
      {searchable && lines.length > 5 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the transcript" aria-label="Search the transcript" className="h-8 pl-8 text-xs" />
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No line matches &ldquo;{q}&rdquo;.</p>
      ) : (
        <ol className="space-y-2 text-sm">
          {shown.map((l, i) => (
            <li key={i} className="grid grid-cols-[3rem_6.5rem_1fr] gap-2">
              <span className="text-[11px] tabular-nums text-muted-foreground">{l.atSecs === null ? "" : formatClock(l.atSecs)}</span>
              <span className={cn("truncate text-xs font-semibold", KIND_STYLE[l.kind])} title={l.speaker}>{l.speaker}</span>
              <span className="whitespace-pre-wrap break-words">{l.text}</span>
            </li>
          ))}
        </ol>
      )}
      {q.trim() && shown.length > 0 && <p className="text-[11px] text-muted-foreground">{shown.length} of {lines.length} lines</p>}
    </div>
  );
}
