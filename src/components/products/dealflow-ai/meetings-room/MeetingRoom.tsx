"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Captions, Check, Hand, Keyboard, LayoutGrid, Lock, LogOut, MessageSquare, Mic, MicOff, MonitorUp, MoreHorizontal, PanelRight, PhoneOff, RefreshCw, Settings, Sparkles,
  Users, Video, VideoOff, Volume2, VolumeX, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { MeetingRoomProps } from "@/lib/dealflow-ai/meetings/room-props";
import { ChatPanel, PeoplePanel, TranscriptPanel } from "./Panels";
import { Lobby } from "./Lobby";
import { RoomErrorBoundary } from "./RoomErrorBoundary";
import { Stage } from "./Stage";
import { QualityBars } from "./Tiles";
import { captionsSupported, useInterimCaptions } from "./useInterimCaptions";
import { useMeetingRoom } from "./useMeetingRoom";
import type { Layout, PanelTab, RoomAgent } from "./types";

const STYLE = `
@keyframes mr-wave{0%,100%{transform:scaleY(.2)}50%{transform:scaleY(1)}}
@keyframes mr-pulse{0%{transform:scale(.9);opacity:.7}100%{transform:scale(1.25);opacity:0}}
@keyframes mr-dots{0%,100%{opacity:.25}50%{opacity:1}}
.mr-wave{animation:mr-wave 900ms ease-in-out infinite}
.mr-pulse{animation:mr-pulse 1.4s ease-out infinite}
.mr-dots{animation:mr-dots 1.2s ease-in-out infinite;letter-spacing:1px;font-size:8px}
@media (prefers-reduced-motion:reduce){.mr-wave,.mr-pulse,.mr-dots{animation:none}}
`;

/** Plays every remote audio track (people and AI agents alike) through hidden audio elements. */
function AudioSink({ room, version }: { room: ReturnType<typeof useMeetingRoom>["room"]; version: number }) {
  const box = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, { el: HTMLMediaElement; detach: () => void }>());
  useEffect(() => {
    const host = box.current;
    if (!room || !host) return;
    const seen = new Set<string>();
    for (const p of room.remoteParticipants.values()) {
      for (const pub of p.audioTrackPublications.values()) {
        const track = pub.track;
        if (!track || !pub.isSubscribed) continue;
        seen.add(pub.trackSid);
        if (!els.current.has(pub.trackSid)) {
          const el = track.attach();
          el.setAttribute("data-track", pub.trackName);
          host.appendChild(el);
          els.current.set(pub.trackSid, { el, detach: () => track.detach(el) });
        }
      }
    }
    for (const [sid, v] of els.current) {
      if (!seen.has(sid)) {
        v.detach();
        v.el.remove();
        els.current.delete(sid);
      }
    }
  }, [room, version]);
  useEffect(() => {
    const map = els.current;
    return () => {
      for (const v of map.values()) {
        v.detach();
        v.el.remove();
      }
      map.clear();
    };
  }, []);
  return <div ref={box} aria-hidden className="hidden" />;
}

function ToolButton({ label, on, danger, onClick, children, badge, disabled }: { label: string; on?: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode; badge?: number; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={on === undefined ? undefined : on}
      title={label}
      className={cn(
        "relative grid size-11 shrink-0 place-items-center rounded-full ring-1 ring-border transition focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
        danger ? "bg-destructive text-white ring-0 hover:bg-destructive/90" : on ? "bg-primary text-primary-foreground ring-0" : "bg-muted text-foreground hover:bg-muted/70",
      )}
    >
      {children}
      {!!badge && <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{badge > 9 ? "9+" : badge}</span>}
    </button>
  );
}

function Banner({ tone = "warn", icon, children, action }: { tone?: "warn" | "info" | "error"; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-center gap-2 border-b px-3 py-1.5 text-sm", tone === "error" ? "bg-red-500/10 text-red-700 dark:text-red-300" : tone === "info" ? "bg-sky-500/10 text-sky-800 dark:text-sky-200" : "bg-amber-500/10 text-amber-800 dark:text-amber-200")}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

function useClock(start: number) {
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Room(props: MeetingRoomProps) {
  const { meeting, me, leaveHref, isGuest, canHost } = props;
  const r = useMeetingRoom(props);
  const [layout, setLayout] = useState<Layout>("gallery");
  const [panel, setPanel] = useState<PanelTab | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [more, setMore] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [seenChat, setSeenChat] = useState(0);
  const [joinedAt] = useState(() => Date.now());
  const clock = useClock(joinedAt);

  const local = r.people.find((p) => p.isLocal);
  const micOn = !!local?.micOn;
  const camOn = !!local?.camOn;
  const sharing = !!local?.sharing;
  const handUp = !!local?.handUp;
  const version = r.version;
  const caption = useInterimCaptions(captions && micOn && r.conn === "connected", typeof navigator !== "undefined" ? navigator.language || "en-IN" : "en-IN");

  const chatCount = r.lines.filter((l) => l.via === "chat").length;
  const unreadChat = panel === "chat" ? 0 : Math.max(0, chatCount - seenChat);
  const togglePanel = useCallback(
    (tab: PanelTab) => {
      if (panel === "chat") setSeenChat(chatCount);
      setPanel(panel === tab ? null : tab);
    },
    [panel, chatCount],
  );
  const peopleBadge = (r.hands.size > 0 ? 1 : 0) + r.liveState.waiting.length;

  const muteAgent = useCallback((a: RoomAgent) => r.setAgentMuted(a.id, !a.muted), [r]);
  const removeAgent = useCallback(
    async (a: RoomAgent) => setHostError(await r.control({ action: "agent-remove", participantId: a.participantId })),
    [r],
  );

  const leave = useCallback(async () => {
    await r.leave();
    window.location.assign(leaveHref);
  }, [r, leaveHref]);

  const endForAll = useCallback(async () => {
    const err = await r.control({ action: "end" });
    if (err) {
      setHostError(err);
      setConfirmEnd(false);
      return;
    }
    await r.leave();
    window.location.assign(leaveHref);
  }, [r, leaveHref]);

  // Keyboard shortcuts (never while typing).
  useEffect(() => {
    if (r.conn !== "connected") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))) return;
      const k = e.key.toLowerCase();
      const toggle = togglePanel;
      if (k === "m") void r.setMic(!micOn);
      else if (k === "v") void r.setCam(!camOn);
      else if (k === "h") r.toggleHand();
      else if (k === "c") toggle("chat");
      else if (k === "t") toggle("transcript");
      else if (k === "p") toggle("people");
      else if (k === "g") setLayout((l) => (l === "gallery" ? "spotlight" : "gallery"));
      else if (k === "?") setShowHelp(true);
      else if (k === "escape") {
        if (panel === "chat") setSeenChat(chatCount);
        setPanel(null);
      }
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [r, micOn, camOn, togglePanel, panel, chatCount]);

  const quality = local?.quality ?? "unknown";
  const agentBanner = useMemo(() => (r.status.ok || meeting.participants.every((p) => p.kind !== "agent") ? null : r.status), [r.status, meeting.participants]);

  if (r.conn === "lobby" || (r.conn === "connecting" && !r.room) || (r.conn === "failed" && !r.room)) {
    return <Lobby meeting={meeting} name={me.name} agents={r.agents} busy={r.conn === "connecting"} error={r.conn === "failed" ? r.connError : null} onJoin={(o) => void r.connect(o)} />;
  }

  if (r.conn === "ended" || r.conn === "duplicate" || r.conn === "failed") {
    const msg =
      r.conn === "ended" ? ["The meeting has ended", "Thanks for joining. The host has closed this meeting."] : r.conn === "duplicate" ? ["Opened in another tab", "You joined this meeting from another window, so this one was disconnected."] : ["You were disconnected", r.connError ?? "The connection to the meeting was lost."];
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-background p-6">
        <div className="max-w-sm space-y-4 text-center">
          <WifiOff className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <h1 className="text-xl font-semibold">{msg[0]}</h1>
          <p className="text-sm text-muted-foreground">{msg[1]}</p>
          <div className="flex justify-center gap-2">
            {r.conn !== "ended" && <Button onClick={() => window.location.reload()}><RefreshCw className="size-4" />{r.conn === "duplicate" ? "Use this window" : "Rejoin"}</Button>}
            <Button variant="outline" onClick={() => window.location.assign(leaveHref)}>{r.conn === "ended" ? "Back" : "Leave"}</Button>
          </div>
        </div>
      </div>
    );
  }

  const panelEl =
    panel === "transcript" ? <TranscriptPanel lines={r.lines} agents={r.agents} interim={null} title={meeting.title} onClose={() => togglePanel(panel as PanelTab)} />
    : panel === "chat" ? <ChatPanel lines={r.lines} agents={r.agents} meId={me.participantId} onSend={(t) => r.submitLine(t, "chat")} onClose={() => togglePanel(panel as PanelTab)} />
    : panel === "people" ? <PeoplePanel people={r.people} agents={r.agents} meeting={meeting} canHost={canHost && !isGuest} live={r.liveState} onClose={() => togglePanel(panel as PanelTab)} onControl={r.control} onMuteAgent={muteAgent} error={hostError} />
    : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <style>{STYLE}</style>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{meeting.title}</h1>
        {r.liveState.locked && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="The room is locked"><Lock className="size-3.5" aria-hidden /><span className="hidden sm:inline">Locked</span></span>}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-300" aria-label={`Meeting time ${clock}`}>
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-red-500" />
          {clock}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={`Your connection: ${quality}`}>
          <QualityBars quality={quality} />
          <span className="hidden sm:inline">{r.conn === "reconnecting" ? "Reconnecting" : quality === "unknown" ? "Connected" : quality[0].toUpperCase() + quality.slice(1)}</span>
        </span>
      </header>

      {r.conn === "reconnecting" && <Banner tone="error" icon={<WifiOff className="size-4" />}>Connection lost. Trying to reconnect. Your microphone and the AI agents are paused until you are back.</Banner>}
      {agentBanner && !agentBanner.ok && <Banner icon={<Sparkles className="size-4" />}>{agentBanner.message}</Banner>}
      {r.micError && <Banner icon={<MicOff className="size-4" />} action={<Button size="xs" variant="ghost" onClick={r.clearMicError}>Dismiss</Button>}>{r.micError}</Banner>}
      {r.sttBlocked && <Banner tone="error" icon={<AlertTriangle className="size-4" />} action={<Button size="xs" variant="ghost" onClick={r.clearStt}>Dismiss</Button>}>Speech-to-text is not available: {r.sttBlocked} Your words are not being transcribed.</Banner>}
      {r.audioBlocked && <Banner tone="info" icon={<Volume2 className="size-4" />} action={<Button size="xs" onClick={() => void r.startAudio()}>Enable sound</Button>}>Your browser is blocking meeting audio until you click.</Banner>}
      {r.tokenExpiring && <Banner icon={<RefreshCw className="size-4" />} action={<Button size="xs" onClick={() => window.location.reload()}>Rejoin</Button>}>Your session is about to expire. Rejoin to keep speaking and saving the transcript.</Banner>}
      {hostError && panel !== "people" && <Banner tone="error" icon={<AlertTriangle className="size-4" />} action={<Button size="xs" variant="ghost" onClick={() => setHostError(null)}>Dismiss</Button>}>{hostError}</Banner>}

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1" aria-label="Participants">
          <Stage
            people={r.people}
            agents={r.agents}
            layout={layout}
            version={version}
            canHost={canHost && !isGuest}
            caption={caption}
            onMuteAgent={muteAgent}
            onRemoveAgent={(a) => void removeAgent(a)}
          />
        </main>
        {panelEl && (
          <aside className="fixed inset-x-0 top-12 bottom-[72px] z-40 border-t bg-card lg:static lg:inset-auto lg:z-auto lg:w-[380px] lg:shrink-0 lg:border-t-0 lg:border-l">{panelEl}</aside>
        )}
      </div>

      <footer className="relative z-50 flex h-[72px] shrink-0 items-center justify-between gap-2 border-t bg-card/95 px-2 backdrop-blur sm:px-4">
        <div className="hidden min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground md:flex">
          <span className="truncate">{r.people.length} in the call{r.agents.some((a) => a.available) ? ` · ${r.agents.filter((a) => a.available).length} AI` : ""}</span>
        </div>
        <div className="flex min-w-0 items-center justify-center gap-1.5 overflow-x-auto sm:gap-2" role="toolbar" aria-label="Meeting controls">
          <ToolButton label={micOn ? "Mute microphone (M)" : "Unmute microphone (M)"} on={micOn} onClick={() => void r.setMic(!micOn)}>
            {micOn ? <Mic className="size-5" /> : <MicOff className="size-5 text-red-500" />}
          </ToolButton>
          <ToolButton label={camOn ? "Turn camera off (V)" : "Turn camera on (V)"} on={camOn} onClick={() => void r.setCam(!camOn)}>
            {camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
          </ToolButton>
          <ToolButton label={sharing ? "Stop sharing your screen" : "Share your screen"} on={sharing} onClick={() => void r.toggleShare()}>
            <MonitorUp className="size-5" />
          </ToolButton>
          <ToolButton label={handUp ? "Lower your hand (H)" : "Raise your hand (H)"} on={handUp} onClick={r.toggleHand}>
            <Hand className="size-5" />
          </ToolButton>
          <ToolButton label={layout === "gallery" ? "Switch to spotlight (G)" : "Switch to gallery (G)"} onClick={() => setLayout((l) => (l === "gallery" ? "spotlight" : "gallery"))}>
            {layout === "gallery" ? <PanelRight className="size-5" /> : <LayoutGrid className="size-5" />}
          </ToolButton>
          <span className="mx-0.5 hidden h-6 w-px bg-border sm:block" aria-hidden />
          <ToolButton label="Live transcript (T)" on={panel === "transcript"} onClick={() => togglePanel("transcript")}>
            <Captions className="size-5" />
          </ToolButton>
          <ToolButton label="Chat (C)" on={panel === "chat"} badge={unreadChat} onClick={() => togglePanel("chat")}>
            <MessageSquare className="size-5" />
          </ToolButton>
          <ToolButton label="People (P)" on={panel === "people"} badge={peopleBadge} onClick={() => togglePanel("people")}>
            <Users className="size-5" />
          </ToolButton>
          <div className="relative">
            <ToolButton label="More" on={more} onClick={() => setMore((v) => !v)}>
              <MoreHorizontal className="size-5" />
            </ToolButton>
            {more && (
              <div role="menu" className="absolute right-0 bottom-14 z-50 w-60 rounded-2xl border bg-popover p-1 text-sm shadow-xl">
                <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted" onClick={() => { setShowSettings(true); setMore(false); }}><Settings className="size-4" />Audio and video settings</button>
                <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted" onClick={() => { setShowHelp(true); setMore(false); }}><Keyboard className="size-4" />Keyboard shortcuts</button>
                {canHost && !isGuest && r.agents.some((a) => a.available) && (
                  <>
                    <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted" onClick={() => { const all = r.agents.filter((a) => a.available); const allMuted = all.every((a) => a.muted); all.forEach((a) => r.setAgentMuted(a.id, !allMuted)); setMore(false); }}>
                      {r.agents.filter((a) => a.available).every((a) => a.muted) ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                      {r.agents.filter((a) => a.available).every((a) => a.muted) ? "Unmute all AI agents" : "Mute all AI agents"}
                    </button>
                    <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted" onClick={async () => { setMore(false); setHostError(await r.control({ action: "lock", locked: !r.liveState.locked })); }}>
                      <Lock className="size-4" />{r.liveState.locked ? "Unlock the room" : "Lock the room"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
          <Button variant="destructive" className="h-11 rounded-full px-4" onClick={() => void leave()} aria-label="Leave the meeting">
            <LogOut className="size-4" /><span className="hidden sm:inline">Leave</span>
          </Button>
          {canHost && !isGuest && (
            <Button className="h-11 rounded-full bg-destructive px-4 text-white hover:bg-destructive/90" onClick={() => setConfirmEnd(true)} aria-label="End the meeting for everyone">
              <PhoneOff className="size-4" /><span className="hidden lg:inline">End for all</span>
            </Button>
          )}
        </div>
      </footer>

      <AudioSink room={r.room} version={version} />

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <div className="space-y-4 p-5">
            <DialogHeader><DialogTitle>Audio and video</DialogTitle><DialogDescription>Choose your devices. Changes apply immediately.</DialogDescription></DialogHeader>
            {([["audioinput", "Microphone", r.devices.audioinput], ["videoinput", "Camera", r.devices.videoinput], ["audiooutput", "Speaker", r.devices.audiooutput]] as const).map(([kind, label, list]) => (
              <label key={kind} className="block text-xs font-medium text-muted-foreground">
                {label}
                <select
                  className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground"
                  value={r.room?.getActiveDevice(kind) ?? ""}
                  onFocus={() => void r.refreshDevices()}
                  onChange={(e) => void r.switchDevice(kind, e.target.value)}
                  disabled={!list.length}
                >
                  {!list.length && <option value="">{kind === "audiooutput" ? "Browser default" : "No device found"}</option>}
                  {list.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || label}</option>)}
                </select>
              </label>
            ))}
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Your microphone level</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, r.localLevel * 6) * 100)}>
                <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${Math.min(1, r.localLevel * 6) * 100}%` }} />
              </div>
            </div>
            {captionsSupported() && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />
                <span>Show live captions of my own voice<span className="block text-xs text-muted-foreground">Uses your browser&apos;s speech recognition for an instant preview on your screen only. The meeting transcript is made separately.</span></span>
              </label>
            )}
            <div className="flex justify-end"><Button onClick={() => setShowSettings(false)}><Check className="size-4" />Done</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent>
          <div className="space-y-3 p-5">
            <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {[["M", "Mute or unmute"], ["V", "Camera on or off"], ["H", "Raise or lower hand"], ["T", "Live transcript"], ["C", "Chat"], ["P", "People"], ["G", "Gallery or spotlight"], ["Esc", "Close the side panel"], ["?", "This help"]].map(([k, d]) => (
                <div key={k} className="contents"><dt><kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-semibold">{k}</kbd></dt><dd className="text-muted-foreground">{d}</dd></div>
              ))}
            </dl>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <DialogContent>
          <div className="space-y-4 p-5">
            <DialogHeader><DialogTitle>End the meeting for everyone?</DialogTitle><DialogDescription>Everyone, including the AI agents, is disconnected and the transcript and summary are prepared. This cannot be undone.</DialogDescription></DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmEnd(false)}>Keep going</Button>
              <Button className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void endForAll()}>End meeting</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The live meeting room: video tiles for people and AI agents, live transcript, chat, host controls. */
export default function MeetingRoom(props: MeetingRoomProps) {
  return (
    <RoomErrorBoundary leaveHref={props.leaveHref}>
      <Room {...props} />
    </RoomErrorBoundary>
  );
}

