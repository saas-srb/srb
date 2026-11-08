import Link from "next/link";
import { Activity, ExternalLink, FileText, ShieldCheck, Sparkles, UserRound, Volume2 } from "lucide-react";
import { SectionCard } from "@/components/products/agentos/AibotsUi";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import CallDirectionBadge from "@/components/products/agentos/calls/CallDirectionBadge";
import CallTranscript from "@/components/products/agentos/calls/CallTranscript";
import CallRecording from "@/components/products/agentos/calls/CallRecording";
import CallRowActions from "@/components/products/agentos/calls/CallRowActions";
import TestBadge from "@/components/products/agentos/calls/TestBadge";
import CallStatusBadge from "@/components/products/agentos/calls/CallStatusBadge";
import { speakerName } from "@/lib/products/agentos/calls/call-display";
import { callActions, describeControlStep, formatInZone, labelCollected } from "@/lib/products/agentos/calls/call-ui";
import type { CallDetailData } from "@/lib/products/agentos/calls/merged";
import { PURPOSE_BY_KEY, variablesFor } from "@/lib/products/agentos/calls/purposes";
import { targetHref } from "@/lib/products/agentos/calls/target-links";
import { formatClock } from "@/lib/products/agentos/voice/call-format";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/** One engine call (phone or scheduled): what it was for, what happened, what was collected, who was in control. */
export default function EngineCallDetail({ data, viewer }: { data: CallDetailData; viewer: { canCall: boolean; isManager: boolean; canWatchLive: boolean } }) {
  const { call, agent, timeZone } = data;
  const when = (iso: string | null) => (iso ? formatInZone(iso, timeZone) : "-");
  const href = targetHref(call.target);
  const purpose = PURPOSE_BY_KEY.get(call.purpose);
  const collected = labelCollected(call.collected, data.dataFields);
  const contextLabels = new Map(variablesFor([call.purpose]).map((v) => [v.key, v.label]));
  const contextRows = Object.entries(data.context).filter(([, v]) => v);
  const actions = callActions({ status: call.status, direction: call.direction, mine: call.mine }, viewer);
  const live = viewer.canWatchLive && (call.status === "dialing" || call.status === "in_progress");
  const c = data.compliance;

  return (
    <div className="space-y-4">
      <SectionCard
        title={
          <span className="flex items-center gap-2">
            {agent && <BotAvatar icon={agent.icon} color={agent.color} imageUrl={agent.avatarUrl} size="sm" />}
            {agent?.name ?? "Deleted agent"}
            <CallStatusBadge status={call.status} />
            <CallDirectionBadge direction={call.direction} />
            {call.testMode && <TestBadge />}
          </span>
        }
        description={purpose?.label ?? call.purpose}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {live && <Link href={`/agentos/calls/${call.id}/live`} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted"><Activity className="size-3.5" />Open live view</Link>}
            <CallRowActions callId={call.id} label={call.target?.label || call.phone || "this call"} actions={actions} timeZone={timeZone} isManager={viewer.isManager} agentId={call.agentId} />
          </div>
        }
      >
        <dl className="divide-y divide-border/40">
          <Row label="About">
            {call.target ? (
              href ? <Link href={href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{call.target.label}<ExternalLink className="size-3" /></Link> : <span className="font-medium">{call.target.label}</span>
            ) : "-"}
            {call.target && <span className="ml-2 text-xs text-muted-foreground">{call.target.entityType} · {call.target.product}</span>}
          </Row>
          {call.direction === "web_public" ? (
            <>
              <Row label="Caller">{data.caller ?? "Website visitor"}</Row>
              <Row label="Website">{data.origin === "self" ? "Your own site" : (data.origin ?? "-")}</Row>
            </>
          ) : (
            <>
              <Row label="Phone number"><span className="font-mono text-xs">{call.phone ?? "-"}</span></Row>
              <Row label={call.direction === "inbound" ? "Caller" : "Placed by"}>{call.direction === "inbound" ? (data.caller ?? "Unknown caller") : call.mine ? "You" : (call.initiatedBy ?? "-")}</Row>
            </>
          )}
          {call.scheduledFor && <Row label="Scheduled for">{when(call.scheduledFor)}</Row>}
          <Row label="Started">{when(call.dialedAt ?? call.createdAt)}</Row>
          {call.endedAt && <Row label="Ended">{when(call.endedAt)}</Row>}
          <Row label="Duration">{call.durationSecs ? formatClock(call.durationSecs) : "-"}</Row>
          {call.outcome && <Row label="Outcome">{call.outcome === "success" ? "Goal reached" : call.outcome === "failure" ? "Goal not reached" : "Unclear"}</Row>}
          {call.terminationReason && <Row label="Ended because">{call.terminationReason}</Row>}
          {call.failure && <Row label="What went wrong"><span className="text-rose-700 dark:text-rose-300">{call.failure.message}</span></Row>}
        </dl>
      </SectionCard>

      {call.summary && (
        <SectionCard title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />{call.summaryTitle || "Summary"}</span>}>
          <p className="whitespace-pre-wrap text-sm">{call.summary}</p>
        </SectionCard>
      )}

      {(data.recording.url || data.recording.note) && (
        <SectionCard title={<span className="flex items-center gap-2"><Volume2 className="size-4 text-primary" />Recording</span>}>
          {data.recording.url ? <CallRecording url={data.recording.url} note={data.recording.note} /> : <p className="text-sm text-muted-foreground">{data.recording.note}</p>}
        </SectionCard>
      )}

      <SectionCard title="Collected from the call" description={data.dataFields.length ? "Labels come from the agent's \"Data to collect\" list." : undefined}>
        {collected.length === 0 ? (
          <p className="text-sm text-muted-foreground">{call.status === "completed" ? "The agent didn't collect any answers on this call." : "Answers appear here once the call has finished."}</p>
        ) : (
          <dl className="divide-y divide-border/40">
            {collected.map((f) => <Row key={f.key} label={f.label}>{f.value || <span className="text-muted-foreground">No answer</span>}</Row>)}
          </dl>
        )}
      </SectionCard>

      <SectionCard title={<span className="flex items-center gap-2"><UserRound className="size-4 text-primary" />Who was in control</span>} description={call.control.mode === "human" ? "A person is speaking now." : "The AI agent handled the call unless listed below."}>
        {data.controlHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one took over. The AI agent spoke for the company throughout.</p>
        ) : (
          <ol className="space-y-1.5 text-sm">
            {data.controlHistory.map((h, i) => <li key={`${h.at}-${i}`}><span className="text-muted-foreground">{when(h.at)}</span> · {describeControlStep(h)} <span className="text-muted-foreground">({h.by})</span></li>)}
          </ol>
        )}
      </SectionCard>

      {(contextRows.length > 0 || c) && (
        <SectionCard title={<span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" />What the agent was told, and the checks</span>}>
          <dl className="divide-y divide-border/40">
            {contextRows.map(([k, v]) => <Row key={k} label={contextLabels.get(k) ?? k}>{v}</Row>)}
            {c && (
              <>
                <Row label="Calling hours">{c.callingWindow.start} to {c.callingWindow.end} ({c.callingWindow.timeZone}){c.callingWindow.overridden ? ` · overridden: ${c.callingWindow.overrideReason ?? "no reason recorded"}` : ""}</Row>
                <Row label="AI disclosure">{c.disclosurePresent ? "The agent has a disclosure line" : c.disclosureRequired ? "Missing (required)" : "Not required"}</Row>
                <Row label="Recording notice">{c.recordingNotice ? "On" : "Off"}</Row>
              </>
            )}
          </dl>
        </SectionCard>
      )}

      {call.transcript && call.transcript.length > 0 && (
        <SectionCard title={<span className="flex items-center gap-2"><FileText className="size-4 text-primary" />Transcript</span>}>
          <CallTranscript lines={call.transcript.map((l) => ({ speaker: speakerName(l, call, agent?.name ?? "Agent"), kind: l.speaker ?? (l.role === "agent" ? "ai" : "lead"), atSecs: l.atSecs, text: l.text }))} />
        </SectionCard>
      )}
    </div>
  );
}
