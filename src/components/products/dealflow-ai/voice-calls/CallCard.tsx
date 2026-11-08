"use client";

import { Activity, ChevronRight, Lock } from "lucide-react";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import CallStatusBadge from "@/components/products/agentos/calls/CallStatusBadge";
import CallDirectionBadge from "@/components/products/agentos/calls/CallDirectionBadge";
import TestBadge from "@/components/products/agentos/calls/TestBadge";
import { formatDuration, formatIst, type PanelCall } from "@/lib/dealflow-ai/call-panel-types";
import type { CallDirection } from "@/lib/products/agentos/calls/types";

/** One call, as its own card. Calls are never merged into a running history. */
export default function CallCard({ call, onOpen }: { call: PanelCall; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group w-full rounded-2xl border border-border/60 bg-card p-3.5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5" aria-label={`Open the ${call.purposeLabel} call from ${formatIst(call.at)}`}>
      <div className="flex flex-wrap items-center gap-2">
        <BotAvatar icon={call.agent.icon} color={call.agent.color} imageUrl={call.agent.avatarUrl} size="sm" />
        <span className="text-sm font-bold text-foreground">{call.agent.name}</span>
        <CallStatusBadge status={call.status} />
        <CallDirectionBadge direction={call.direction as CallDirection} />
        {call.testMode && <TestBadge />}
        {call.live && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600"><Activity className="size-3" />Live</span>}
        <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {call.status === "scheduled" ? "Scheduled for " : ""}{formatIst(call.at)} · {call.purposeLabel}{call.durationSecs ? ` · ${formatDuration(call.durationSecs)}` : ""}
        {call.phoneMasked ? ` · ${call.phoneMasked}` : ""}
      </p>
      {call.summary ? (
        <p className="mt-1.5 line-clamp-2 text-sm text-foreground/90">{call.summary}</p>
      ) : (
        <p className="mt-1.5 text-xs italic text-muted-foreground">{call.live ? "The call is in progress." : call.status === "completed" ? "No summary was produced for this call." : "No summary."}</p>
      )}
      {call.collected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {call.collected.slice(0, 6).map((f) => (
            <span key={f.key} className="max-w-full truncate rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px]" title={`${f.label}: ${f.value}`}>
              <span className="text-muted-foreground">{f.label}:</span> <span className="font-medium">{f.value || "No answer"}</span>
            </span>
          ))}
          {call.collected.length > 6 && <span className="px-1 text-[11px] text-muted-foreground">+{call.collected.length - 6} more</span>}
        </div>
      )}
      {call.access !== "full" && <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="size-3" />Transcript and recording aren&apos;t available to you.</p>}
    </button>
  );
}
