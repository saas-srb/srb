"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Download, Hand, Lock, Mic, MicOff, Search, Send, Sparkles, Unlock, UserCheck, UserX, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MeetingView } from "@/lib/dealflow-ai/meetings/types";
import type { ChatLine, PanelTab, RoomAgent, RoomLiveState, RoomPerson } from "./types";
import { QualityBars } from "./Tiles";

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function KindBadge({ kind }: { kind: "internal" | "external" | "agent" }) {
  const map = { internal: ["Staff", "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"], external: ["Guest", "bg-amber-500/15 text-amber-700 dark:text-amber-300"], agent: ["AI", "bg-violet-500/15 text-violet-600 dark:text-violet-300"] } as const;
  return <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide", map[kind][1])}>{map[kind][0]}</span>;
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return (
    <>
      {parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i} className="rounded bg-amber-300/60 px-0.5 text-inherit dark:bg-amber-400/40">{p}</mark> : <span key={i}>{p}</span>))}
    </>
  );
}

export function PanelFrame({ title, onClose, actions, children }: { title: string; onClose: () => void; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex h-full min-h-0 flex-col bg-card">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex items-center gap-1">
          {actions}
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={`Close ${title}`}>
            <X className="size-4" />
          </Button>
        </div>
      </header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

export function TranscriptPanel({ lines, agents, interim, title, onClose }: { lines: ChatLine[]; agents: RoomAgent[]; interim: ChatLine | null; title: string; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [stick, setStick] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const names = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);
  const shown = useMemo(() => (q.trim() ? lines.filter((l) => l.text.toLowerCase().includes(q.trim().toLowerCase()) || l.speakerName.toLowerCase().includes(q.trim().toLowerCase())) : lines), [lines, q]);

  useEffect(() => {
    const el = box.current;
    if (el && stick) el.scrollTop = el.scrollHeight;
  }, [shown.length, interim, stick]);

  function download() {
    const out = lines.map((l) => `[${time(l.at)}] ${l.speakerName}${l.speakerKind === "agent" ? " (AI)" : ""}: ${l.text}${l.speakerKind !== "agent" && l.addressedTo.length ? `  -> ${l.addressedTo.map((id) => names.get(id) ?? "agent").join(", ")}` : ""}`).join("\n");
    const url = URL.createObjectURL(new Blob([`${title}\n\n${out}\n`], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w-]+/g, "-").slice(0, 60) || "meeting"}-transcript.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <PanelFrame
      title="Live transcript"
      onClose={onClose}
      actions={
        <Button variant="ghost" size="icon-sm" onClick={download} disabled={!lines.length} aria-label="Download transcript">
          <Download className="size-4" />
        </Button>
      }
    >
      <div className="border-b p-2">
        <label className="relative block">
          <span className="sr-only">Search the transcript</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search who said what" className="h-8 w-full rounded-lg border bg-background pr-2 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </label>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={box}
          onScroll={(e) => {
            const el = e.currentTarget;
            setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
          }}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Meeting transcript"
          className="h-full space-y-3 overflow-y-auto p-3"
        >
          {!shown.length && <p className="py-8 text-center text-sm text-muted-foreground">{q ? "No lines match your search." : "Nothing has been said yet. Lines appear here as people speak or type."}</p>}
          {shown.map((l) => (
            <div key={l.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{l.speakerName}</span>
                <KindBadge kind={l.speakerKind} />
                <span className="text-[11px] text-muted-foreground tabular-nums">{time(l.at)}</span>
                {l.via === "chat" && <span className="text-[11px] text-muted-foreground">typed</span>}
                {l.speakerKind !== "agent" && l.addressedTo.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-1.5 py-px text-[11px] text-violet-600 dark:text-violet-300">
                    <Sparkles className="size-2.5" aria-hidden />to {names.get(id) ?? "agent"}
                  </span>
                ))}
              </div>
              <p className="mt-0.5 leading-relaxed whitespace-pre-wrap text-foreground/90">
                <Highlight text={l.text} q={q.trim()} />
              </p>
            </div>
          ))}
          {interim && <p className="text-sm text-muted-foreground italic">{interim.speakerName}: {interim.text}…</p>}
        </div>
        {!stick && (
          <button type="button" onClick={() => setStick(true)} className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg">
            <ArrowDown className="size-3.5" aria-hidden />
            Latest
          </button>
        )}
      </div>
    </PanelFrame>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

/** For an agent's spoken reply, the line that triggered it (so a reply to a typed question also shows in the chat). */
function triggerOf(l: ChatLine, byId: Map<string, ChatLine>): ChatLine | undefined {
  if (l.speakerKind !== "agent" || !l.id.startsWith("ag-")) return undefined;
  return byId.get(l.id.slice(3).split(":")[0]);
}

export function ChatPanel({ lines, agents, meId, onSend, onClose }: { lines: ChatLine[]; agents: RoomAgent[]; meId: string; onSend: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  const chat = useMemo(() => lines.filter((l) => l.via === "chat" || triggerOf(l, byId)?.via === "chat"), [lines, byId]);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };
  const hint = agents.find((a) => a.available);
  return (
    <PanelFrame title="Chat" onClose={onClose}>
      <div ref={box} role="log" aria-live="polite" aria-label="Chat messages" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!chat.length && <p className="py-8 text-center text-sm text-muted-foreground">{hint ? `Messages here are seen by everyone. Start a message with an agent's name, for example "${hint.name}, ...", and it answers out loud.` : "Messages here are seen by everyone in the meeting."}</p>}
        {chat.map((l) => (
          <div key={l.id} className={cn("flex flex-col text-sm", l.speakerId === meId ? "items-end" : "items-start")}>
            <span className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {l.speakerKind === "agent" ? <Sparkles className="size-3 text-violet-500" aria-hidden /> : null}
              {l.speakerId === meId ? "You" : l.speakerName} · {time(l.at)}
            </span>
            <p className={cn("max-w-[85%] rounded-2xl px-3 py-1.5 leading-relaxed whitespace-pre-wrap", l.speakerId === meId ? "bg-primary text-primary-foreground" : l.speakerKind === "agent" ? "bg-violet-500/10" : "bg-muted")}>{l.text}</p>
          </div>
        ))}
      </div>
      <form
        className="flex shrink-0 gap-2 border-t p-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="sr-only" htmlFor="mr-chat-input">Message</label>
        <textarea
          id="mr-chat-input"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 1000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={hint ? `Message everyone, or "${hint.name}, ..."` : "Message everyone"}
          className="max-h-28 min-h-9 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <Button type="submit" size="icon-lg" disabled={!text.trim()} aria-label="Send message">
          <Send className="size-4" />
        </Button>
      </form>
    </PanelFrame>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

export function PeoplePanel({
  people, agents, meeting, canHost, live, onClose, onControl, onMuteAgent, error,
}: {
  people: RoomPerson[];
  agents: RoomAgent[];
  meeting: MeetingView;
  canHost: boolean;
  live: RoomLiveState;
  onClose: () => void;
  onControl: (body: Record<string, unknown>) => Promise<string | null>;
  onMuteAgent: (a: RoomAgent) => void;
  error?: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const run = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setMsg(await onControl(body));
    setBusy(null);
  };
  const team = people.filter((p) => p.kind === "internal");
  const guests = people.filter((p) => p.kind === "external");
  const present = new Set(people.map((p) => p.identity));
  const notJoined = meeting.participants.filter((p) => p.kind !== "agent" && !present.has(p.id));

  const row = (p: RoomPerson) => (
    <li key={p.identity} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{p.name}{p.isLocal ? " (You)" : ""}</span>
          {p.role !== "participant" && <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold uppercase">{p.role === "host" ? "Host" : "Co-host"}</span>}
        </span>
      </span>
      {p.handUp && <Hand className="size-3.5 text-amber-500" aria-label="Hand raised" />}
      {p.micOn ? <Mic className="size-3.5 text-muted-foreground" aria-label="Microphone on" /> : <MicOff className="size-3.5 text-red-500" aria-label="Microphone off" />}
      <QualityBars quality={p.quality} />
      {canHost && !p.isLocal && (
        <span className="flex gap-0.5">
          <Button variant="ghost" size="icon-xs" disabled={!p.micOn || busy === `m${p.identity}`} onClick={() => run(`m${p.identity}`, { action: "mute", participantId: p.identity })} aria-label={`Mute ${p.name}`}>
            <MicOff className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" disabled={busy === `r${p.identity}`} onClick={() => run(`r${p.identity}`, { action: "remove", participantId: p.identity })} aria-label={`Remove ${p.name} from the call`}>
            <UserX className="size-3 text-destructive" />
          </Button>
        </span>
      )}
    </li>
  );

  const group = (title: string, count: number, children: React.ReactNode) => (
    <div key={title} className="mb-3">
      <h3 className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title} · {count}</h3>
      <ul>{children}</ul>
    </div>
  );

  return (
    <PanelFrame title={`People (${people.length + agents.filter((a) => a.available).length})`} onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {canHost && live.waiting.length > 0 && (
          <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2">
            <h3 className="px-1 pb-1 text-xs font-semibold">Waiting to be let in · {live.waiting.length}</h3>
            <ul className="space-y-1">
              {live.waiting.map((w) => (
                <li key={w.id} className="flex items-center gap-2 px-1 text-sm">
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  <Button size="xs" onClick={() => run(`a${w.id}`, { action: "admit", participantId: w.id })} disabled={busy === `a${w.id}`}>
                    <UserCheck className="size-3" />Admit
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => run(`d${w.id}`, { action: "deny", participantId: w.id })} disabled={busy === `d${w.id}`}>
                    Deny
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {group("Team", team.length, team.map(row))}
        {group("Guests", guests.length, guests.length ? guests.map(row) : <li className="px-2 py-1 text-sm text-muted-foreground">No guests are in the call yet.</li>)}
        {group("AI agents", agents.length, <>
          {agents.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60">
              <Sparkles className="size-3.5 shrink-0 text-violet-500" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{a.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{a.available ? (a.state === "muted" ? "Muted" : a.state[0].toUpperCase() + a.state.slice(1)) : "No longer available"}</span>
              </span>
              <KindBadge kind="agent" />
              {canHost && a.available && (
                <span className="flex gap-0.5">
                  <Button variant="ghost" size="icon-xs" onClick={() => onMuteAgent(a)} aria-label={a.muted ? `Unmute ${a.name}` : `Mute ${a.name}`}>
                    {a.muted ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}
                  </Button>
                </span>
              )}
              {canHost && (
                <Button variant="ghost" size="icon-xs" onClick={() => run(`x${a.id}`, { action: "agent-remove", participantId: a.participantId })} disabled={busy === `x${a.id}`} aria-label={`Remove ${a.name}`}>
                  <UserX className="size-3 text-destructive" />
                </Button>
              )}
            </li>
          ))}
          {!agents.length && <li className="px-2 py-1 text-sm text-muted-foreground">No AI agents in this meeting.</li>}
        </>)}
        {canHost && live.availableAgents.length > 0 && (
          <div className="mb-3 flex gap-2 px-2">
            <label className="sr-only" htmlFor="mr-add-agent">Add an AI agent</label>
            <select id="mr-add-agent" value={pick} onChange={(e) => setPick(e.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm">
              <option value="">Add an AI agent…</option>
              {live.availableAgents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.category ? ` · ${a.category}` : ""}</option>)}
            </select>
            <Button size="sm" disabled={!pick || busy === "add"} onClick={async () => { await run("add", { action: "agent-add", agentId: pick }); setPick(""); }}>Add</Button>
          </div>
        )}
        {canHost && notJoined.length > 0 && (
          group("Invited, not here yet", notJoined.length, notJoined.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <KindBadge kind={p.kind} />
            </li>
          )))
        )}
        {(msg || error) && <p role="alert" className="px-2 text-sm text-destructive">{msg || error}</p>}
      </div>
      {canHost && (
        <footer className="shrink-0 border-t p-2">
          <Button variant="outline" size="sm" className="w-full" disabled={busy === "lock"} onClick={() => run("lock", { action: "lock", locked: !live.locked })}>
            {live.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
            {live.locked ? "Unlock the room" : "Lock the room (no new guests)"}
          </Button>
        </footer>
      )}
    </PanelFrame>
  );
}

export type { PanelTab };
