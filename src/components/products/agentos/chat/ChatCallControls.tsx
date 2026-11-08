"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AudioLines, ExternalLink, LoaderCircle, PhoneCall, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import CallWithAI from "@/components/products/agentos/calls/CallWithAI";
import ChatTalkPanel from "@/components/products/agentos/chat/ChatTalkPanel";
import { loadCallOptionsAction, type PlacedCall } from "@/lib/products/agentos/calls/actions";
import type { CallOptions } from "@/lib/products/agentos/calls/options";
import { chatCallStatusAction, endChatCallAction, loadChatSummaryAction, type ChatCallStatus } from "@/app/(products)/agentos/(protected)/chat-call-actions";
import { chatContextLine, chatTarget, phoneCallAvailability, talkHereAvailability } from "@/lib/products/agentos/chat-call";
import { isTerminal } from "@/lib/products/agentos/calls/types";

const CHIP: Record<string, { label: string; tone: string }> = {
  scheduled: { label: "Call scheduled", tone: "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200" },
  dialing: { label: "Calling…", tone: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200" },
  in_progress: { label: "Call in progress", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200" },
  completed: { label: "Call ended", tone: "border-border bg-muted/40 text-muted-foreground" },
  failed: { label: "Call failed", tone: "border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200" },
  no_answer: { label: "No answer", tone: "border-border bg-muted/40 text-muted-foreground" },
  busy: { label: "Line busy", tone: "border-border bg-muted/40 text-muted-foreground" },
  cancelled: { label: "Call cancelled", tone: "border-border bg-muted/40 text-muted-foreground" },
};

/**
 * Call buttons for a text chat's header: "Call" (the shared Call with AI dialog, with the chat as its target), "Talk here" (a browser
 * voice conversation in a side panel), and a status chip for the call placed from this chat. Rendered only for the chat's owner.
 */
export default function ChatCallControls({ chatId, chatTitle, onNote }: { chatId: string | null; chatTitle: string | null; onNote: (text: string) => void }) {
  const [options, setOptions] = useState<CallOptions | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [status, setStatus] = useState<ChatCallStatus | null>(null);
  const [ending, setEnding] = useState(false);

  // The chat must exist (first message sent) before it can be a call target, so options are only fetched then.
  useEffect(() => {
    if (!chatId) return;
    let alive = true;
    loadCallOptionsAction()
      .then((r) => { if (!alive) return; if (r.ok) setOptions(r.options); else setLoadFailed(true); })
      .catch(() => { if (alive) setLoadFailed(true); });
    return () => { alive = false; };
  }, [chatId]);

  const facts = { chatCreated: Boolean(chatId), options };
  const phone = phoneCallAvailability(facts);
  const talk = talkHereAvailability(facts);

  const refresh = useCallback(async (id: string) => {
    const r = await chatCallStatusAction(id).catch(() => null);
    if (r?.ok) setStatus(r.call);
  }, []);

  // Light polling while the call is open; paused when the tab is hidden, stopped when the call is over.
  const done = status ? isTerminal(status.status) : false;
  useEffect(() => {
    if (!callId || done) return;
    const every = status?.status === "scheduled" ? 30_000 : 5_000;
    const tick = () => { if (document.visibilityState === "visible") void refresh(callId); };
    const t = setInterval(tick, every);
    return () => clearInterval(t);
  }, [callId, done, status?.status, refresh]);

  const onPlaced = (c: PlacedCall) => {
    setCallId(c.id);
    setStatus({ status: c.status, scheduledFor: c.scheduledFor, canEnd: false });
    void refresh(c.id);
  };

  const end = async () => {
    if (!callId) return;
    setEnding(true);
    const r = await endChatCallAction(callId).catch(() => null);
    setEnding(false);
    if (!r || !r.ok) toast.error(r && !r.ok ? r.error : "Couldn't end the call.");
    await refresh(callId);
  };

  const disabledButton = (label: string, reason: string | null, icon: React.ReactNode) => (
    <Button type="button" size="sm" variant="outline" disabled title={reason ?? undefined} aria-label={`${label}. ${reason ?? ""}`.trim()}>
      {icon}<span className="hidden sm:inline">{label}</span>
    </Button>
  );

  const chip = status ? (CHIP[status.status] ?? CHIP.completed) : null;
  const live = status?.status === "dialing" || status?.status === "in_progress";
  const unavailableReason = phone.enabled ? null : phone.reason ?? (loadFailed ? "Couldn't check the calling options. Reload the page." : null);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {chip && callId && (
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", chip.tone)} role="status" aria-live="polite">
          {live && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
          {chip.label}
          {live && status?.canEnd && (
            <Link href={`/agentos/calls/${callId}/live`} target="_blank" className="inline-flex items-center gap-0.5 underline"><ExternalLink className="size-3" />Open live view</Link>
          )}
          {live && !status?.canEnd && <Link href={`/agentos/calls/${callId}/live`} target="_blank" className="underline">Open live view</Link>}
          {!live && <Link href={`/agentos/calls/${callId}`} target="_blank" className="underline">View call</Link>}
          {(live && status?.canEnd) || status?.status === "scheduled" ? (
            <button type="button" onClick={end} disabled={ending} className="inline-flex items-center gap-0.5 font-semibold underline disabled:opacity-60">
              {ending ? <LoaderCircle className="size-3 animate-spin" /> : <PhoneOff className="size-3" />}{status?.status === "scheduled" ? "Cancel" : "End call"}
            </button>
          ) : null}
        </span>
      )}

      {phone.enabled && chatId ? (
        <CallWithAI
          target={chatTarget(chatId, chatTitle)}
          defaultPurpose="custom"
          variant="outline"
          size="sm"
          label="Call"
          initialNotes={chatContextLine(chatTitle)}
          contextSummaryLoader={() => loadChatSummaryAction(chatId).then((r) => (r.ok ? { ok: true as const, summary: r.summary } : { ok: false as const, error: r.error }))}
          onPlaced={onPlaced}
        />
      ) : (
        disabledButton("Call", unavailableReason, <PhoneCall className="size-4" />)
      )}

      {talk.enabled && chatId ? (
        <>
          <Button type="button" size="sm" variant="outline" onClick={() => setTalkOpen(true)} title="Talk out loud with a voice agent in this screen">
            <AudioLines className="size-4" /><span className="hidden sm:inline">Talk here</span>
          </Button>
          {options && <ChatTalkPanel open={talkOpen} onOpenChange={setTalkOpen} chatId={chatId} agents={options.agents} onNotePosted={onNote} />}
        </>
      ) : (
        disabledButton("Talk here", talk.reason ?? (loadFailed ? "Couldn't check the voice options. Reload the page." : null), <AudioLines className="size-4" />)
      )}
    </div>
  );
}
