import Link from "next/link";
import { Bot, Phone } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import type { AiCallEntry } from "@/lib/products/call-writeback";
import type { TargetCallRow } from "@/lib/products/call-target-calls";
import { formatDateTime } from "@/lib/utils";

/**
 * Two read-only blocks every product can show on a record: "AI call" (what the agent learned, kept apart from anything a person
 * entered) and "Calls" (every call placed about the record, linking to the AgentOS call page). Server component; data comes from the
 * product's own page.
 */

const STATUS_TEXT: Record<string, string> = {
  scheduled: "Scheduled", dialing: "Dialing", in_progress: "In progress", completed: "Completed", failed: "Failed", no_answer: "No answer", busy: "Busy", cancelled: "Cancelled",
};
const statusText = (s: string) => STATUS_TEXT[s] ?? s.replace(/_/g, " ");

export function AiCallSummaries({ entries, title = "AI call" }: { entries: AiCallEntry[]; title?: string }) {
  return (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-4" /> {title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Written by the AI agent after a call. It is kept separate from the details people entered and never replaces them.</p>
        {entries.length === 0 && <p className="text-sm text-muted-foreground">No AI call has finished for this record yet.</p>}
        {entries.map((e) => (
          <div key={e.callId} className="space-y-2 rounded-lg border border-border/60 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{e.title ?? e.purposeLabel}</p>
              <p className="text-xs text-muted-foreground">{e.purposeLabel} · {statusText(e.status)} · {formatDateTime(e.at)}{e.calledBy ? ` · by ${e.calledBy}` : ""}</p>
            </div>
            {e.summary ? <p className="whitespace-pre-wrap text-muted-foreground">{e.summary}</p> : <p className="text-muted-foreground">No summary was produced for this call.</p>}
            {e.fields.length > 0 && (
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {e.fields.map((f) => (
                  <div key={f.key} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                    <dd className="break-words font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </CardContent>
    </GlassCard>
  );
}

export function CallsList({ rows }: { rows: TargetCallRow[] }) {
  return (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle className="flex items-center gap-2"><Phone className="size-4" /> Calls ({rows.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No calls have been placed about this record.</p>}
        {rows.map((c) => (
          <Link key={c.id} href={`/agentos/calls/${encodeURIComponent(c.id)}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-2.5 text-sm transition-colors hover:bg-muted/50">
            <span className="font-medium">{c.purposeLabel}</span>
            <span className="text-xs text-muted-foreground">
              {statusText(c.status)} · {c.scheduledFor && c.status === "scheduled" ? `for ${formatDateTime(c.scheduledFor)}` : formatDateTime(c.at)}{c.phone ? ` · ${c.phone}` : ""}{c.calledBy ? ` · ${c.calledBy}` : ""}
            </span>
          </Link>
        ))}
      </CardContent>
    </GlassCard>
  );
}
