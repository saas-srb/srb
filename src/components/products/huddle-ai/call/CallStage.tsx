"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  WifiOff,
  Maximize,
  Minimize,
  Loader2,
  Hand,
  Signal,
  SignalLow,
  SignalMedium,
  Phone,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRealtime, useScopeEvents } from "@/components/products/huddle-ai/RealtimeProvider";
import { useCall } from "@/components/products/huddle-ai/call/CallProvider";
import { useCallMedia } from "@/components/products/huddle-ai/call/useCallMedia";
import { useRemoteAudioLevels } from "@/components/products/huddle-ai/call/useRemoteAudioLevels";
import CallControls from "@/components/products/huddle-ai/call/CallControls";
import CallSidebar from "@/components/products/huddle-ai/call/CallSidebar";
import { scopeKey } from "@/lib/products/huddle-ai/event-key";
import { MeshTransport, type NetworkQuality } from "@/lib/products/huddle-ai/webrtc-transport";
import { CALL_HEARTBEAT_MS, type ScreenSurface } from "@/lib/products/huddle-ai/call-constants";
import type { SerializedCall, SerializedCallParticipant } from "@/lib/products/huddle-ai/call-types";
import type { MessageScope } from "@/components/products/huddle-ai/types";

interface FlyReaction {
  id: string;
  userId: string;
  emoji: string;
}

function avatarHue(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 42%)`;
}

function Tile({
  name,
  stream,
  muted,
  speaking,
  isLocal,
  camOn,
  presenting,
  handRaised,
  large,
}: {
  name: string;
  stream: MediaStream | null;
  muted: boolean;
  speaking: boolean;
  isLocal?: boolean;
  camOn: boolean;
  presenting?: boolean;
  handRaised?: boolean;
  large?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  const hasVideo = camOn && (stream?.getVideoTracks().some((t) => t.readyState === "live" && t.enabled) ?? false);
  const showVid = hasVideo && !presenting;
  return (
    <div
      className={cn(
        "group/tile relative flex size-full items-center justify-center overflow-hidden rounded-2xl bg-[#15171d] transition-shadow",
        speaking ? "shadow-[0_0_0_2.5px_theme(colors.green.400)]" : "shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
      )}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={isLocal}
        className={cn("size-full object-cover", isLocal && !presenting && "-scale-x-100", !showVid && "hidden")}
      />
      {!showVid && (
        <div className="flex size-full items-center justify-center">
          <span
            className={cn("flex items-center justify-center rounded-full font-semibold text-white", large ? "size-28 text-4xl" : "size-16 text-xl")}
            style={{ background: avatarHue(name) }}
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
        </div>
      )}

      {handRaised && (
        <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-amber-400 text-[#0b0d12]">
          ✋
        </span>
      )}

      <div className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
        {muted ? (
          <span className="flex size-3.5 items-center justify-center rounded-full bg-destructive/90">
            <span className="text-[9px]">✕</span>
          </span>
        ) : null}
        <span className="truncate">
          {name}
          {isLocal ? " (you)" : ""}
        </span>
        {presenting && <span className="text-white/60">· presenting</span>}
      </div>
    </div>
  );
}

const QUALITY_ICON: Record<NetworkQuality, typeof Signal> = {
  good: Signal,
  ok: SignalMedium,
  poor: SignalLow,
  unknown: SignalMedium,
};

export default function CallStage({
  call: initialCall,
  iceServers,
  currentUserId,
  currentUserName,
  conversationScope,
  screenShareEnabled = true,
}: {
  call: SerializedCall;
  iceServers: RTCIceServer[];
  currentUserId: string;
  currentUserName: string;
  conversationScope: MessageScope;
  screenShareEnabled?: boolean;
}) {
  const router = useRouter();
  const { connected } = useRealtime();
  const { setActiveCall } = useCall();
  const mode = initialCall.mode;
  const media = useCallMedia(mode === "video");

  const [phase, setPhase] = useState<"lobby" | "connecting" | "in" | "ended">("lobby");
  const [call, setCall] = useState<SerializedCall>(initialCall);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [peerConn, setPeerConn] = useState<Map<string, RTCPeerConnectionState>>(new Map());
  const [handRaised, setHandRaised] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [reactions, setReactions] = useState<FlyReaction[]>([]);
  const [netQuality, setNetQuality] = useState<NetworkQuality>("good");
  const [mediaStates, setMediaStates] = useState<Map<string, { micOn: boolean; camOn: boolean }>>(new Map());
  const [elapsed, setElapsed] = useState(0);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"people" | "chat">("people");
  const [fullscreen, setFullscreen] = useState(false);

  const transportRef = useRef<MeshTransport | null>(null);
  const signalEsRef = useRef<EventSource | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const rosterRef = useRef<string[]>([]);

  const speakingRemote = useRemoteAudioLevels(remoteStreams);
  const scopeK = scopeKey({ type: "call", id: call._id });

  const post = useCallback(
    (payload: Record<string, unknown>) =>
      fetch(`/api/huddle-ai/calls/${call._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: payload.action === "leave" || payload.action === "end",
      }),
    [call._id]
  );

  const applyRoster = useCallback((serialized: SerializedCall) => {
    const joined = serialized.participants.filter((p) => p.state === "joined" && p.userId).map((p) => p.userId);
    rosterRef.current = joined;
    transportRef.current?.setRoster(joined);
  }, []);

  // --- join ------------------------------------------------------------
  const join = useCallback(async () => {
    setPhase("connecting");
    const stream = media.stream ?? (await media.start({ video: mode === "video" }));

    const res = await post({ action: "join" });
    const json = await res.json();
    if (!res.ok) {
      setPhase("lobby");
      return;
    }
    const joinedCall: SerializedCall = json.call ?? call;
    setCall(joinedCall);

    const transport = new MeshTransport({
      callId: call._id,
      selfId: currentUserId,
      iceServers: (json.iceServers ?? iceServers) as RTCIceServer[],
      sendSignal: (to, type, data) => {
        void fetch(`/api/huddle-ai/calls/${call._id}/signal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, type, data }),
        });
      },
      onRemoteStream: (peerId, s) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          if (s) next.set(peerId, s);
          else next.delete(peerId);
          return next;
        });
      },
      onPeerConnectionState: (peerId, state) => {
        setPeerConn((prev) => new Map(prev).set(peerId, state));
      },
    });
    transportRef.current = transport;
    if (stream) transport.setLocalStream(stream);

    const es = new EventSource(`/api/huddle-ai/calls/${call._id}/signal-stream`);
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data) as { type: string; from?: string; signalType?: string; data?: unknown };
        if (d.type === "signal" && d.from && d.signalType) {
          void transport.handleSignal(d.from, d.signalType as never, d.data);
        }
      } catch {
        /* ignore */
      }
    };
    signalEsRef.current = es;

    applyRoster(joinedCall);
    setActiveCall({ callId: call._id, title: call.title, mode });
    setPhase("in");
    void post({ action: "media", micOn: media.micOn, camOn: mode === "video" });
  }, [media, mode, post, call, currentUserId, iceServers, applyRoster, setActiveCall]);

  // --- leave / cleanup ------------------------------------------------
  const cleanup = useCallback(() => {
    transportRef.current?.close();
    transportRef.current = null;
    signalEsRef.current?.close();
    signalEsRef.current = null;
    screenTrackRef.current?.stop();
    media.stop();
    setActiveCall(null);
  }, [media, setActiveCall]);

  const leave = useCallback(
    (asHost: boolean) => {
      void post({ action: asHost ? "end" : "leave" });
      cleanup();
      setPhase("ended");
      router.push(conversationScope.type === "dm" ? `/huddle-ai/dm/${conversationScope.id}` : "/huddle-ai/channels");
    },
    [post, cleanup, router, conversationScope]
  );

  useEffect(() => {
    return () => {
      // Best-effort leave if the user navigates away without hitting the button.
      if (transportRef.current) {
        void post({ action: "leave" });
        cleanup();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch(`/api/huddle-ai/calls/${call._id}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.call) {
        setCall(json.call as SerializedCall);
        applyRoster(json.call as SerializedCall);
      }
    } catch {
      /* ignore */
    }
  }, [call._id, applyRoster]);

  // --- realtime: call_state on the call scope -------------------------
  useScopeEvents(scopeK, (event) => {
    if (event.kind !== "call_state") return;
    const p = event.payload as Record<string, unknown>;
    const action = p.action as string;

    if (action === "reaction") {
      const id = `${Date.now()}-${Math.random()}`;
      setReactions((prev) => [...prev, { id, userId: p.userId as string, emoji: p.emoji as string }]);
      setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 3500);
      return;
    }
    if (action === "media") {
      setMediaStates((prev) => new Map(prev).set(p.userId as string, { micOn: p.micOn !== false, camOn: p.camOn === true }));
      return;
    }
    if (action === "ended") {
      cleanup();
      setPhase("ended");
      router.push(conversationScope.type === "dm" ? `/huddle-ai/dm/${conversationScope.id}` : "/huddle-ai/channels");
      return;
    }
    // joined / left / hand / screen → refresh authoritative state
    void refreshState();
  });

  // --- heartbeat + poll + network quality ---------------------------
  useEffect(() => {
    if (phase !== "in") return;
    const hb = setInterval(async () => {
      try {
        const res = await post({ action: "heartbeat" });
        const json = await res.json();
        if (Array.isArray(json.roster)) {
          const next = (json.roster as string[]).filter((id) => id !== currentUserId);
          if (next.length !== rosterRef.current.length || next.some((id) => !rosterRef.current.includes(id))) {
            rosterRef.current = next;
            transportRef.current?.setRoster(next);
          }
        }
      } catch {
        /* ignore */
      }
    }, CALL_HEARTBEAT_MS);
    const poll = setInterval(refreshState, 5000);
    const nq = setInterval(async () => {
      const q = await transportRef.current?.networkQuality();
      if (q) setNetQuality(q);
    }, 3000);
    return () => {
      clearInterval(hb);
      clearInterval(poll);
      clearInterval(nq);
    };
  }, [phase, post, refreshState, currentUserId]);

  // --- duration timer ---------------------------------------------
  useEffect(() => {
    if (phase !== "in") return;
    const base = call.activeAt ? new Date(call.activeAt).getTime() : Date.now();
    const t = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - base) / 1000))), 1000);
    return () => clearInterval(t);
  }, [phase, call.activeAt]);

  // --- broadcast our media state on toggle ------------------------
  useEffect(() => {
    if (phase !== "in") return;
    void post({ action: "media", micOn: media.micOn, camOn: media.camOn });
  }, [media.micOn, media.camOn, phase, post]);

  // --- fullscreen ------------------------------------------------
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen().catch(() => {});
      setFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    }
  }, []);
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // --- screen share -------------------------------------------
  const toggleShare = useCallback(async () => {
    if (sharing) {
      screenTrackRef.current?.stop();
      screenTrackRef.current = null;
      setLocalScreenStream(null);
      const camTrack = media.stream?.getVideoTracks()[0] ?? null;
      await transportRef.current?.replaceVideoTrack(camTrack);
      setSharing(false);
      void post({ action: "screen", on: false });
      return;
    }
    try {
      const ds = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = ds.getVideoTracks()[0];
      screenTrackRef.current = track;
      setLocalScreenStream(ds);
      await transportRef.current?.replaceVideoTrack(track);
      setSharing(true);
      const surface = (track.getSettings() as { displaySurface?: string }).displaySurface;
      void post({
        action: "screen",
        on: true,
        surface: (["monitor", "screen"].includes(surface ?? "") ? "screen" : surface === "window" ? "window" : surface === "browser" ? "tab" : "unknown") as ScreenSurface,
      });
      track.onended = () => {
        screenTrackRef.current = null;
        setLocalScreenStream(null);
        void transportRef.current?.replaceVideoTrack(media.stream?.getVideoTracks()[0] ?? null);
        setSharing(false);
        void post({ action: "screen", on: false });
      };
    } catch {
      /* user cancelled */
    }
  }, [sharing, media.stream, post]);

  const toggleHand = useCallback(() => {
    const next = !handRaised;
    setHandRaised(next);
    void post({ action: "hand", raised: next });
  }, [handRaised, post]);

  const react = useCallback((emoji: string) => void post({ action: "reaction", emoji }), [post]);

  // --- derived ------------------------------------------------
  const joined = useMemo(() => call.participants.filter((p) => p.state === "joined"), [call.participants]);
  const isHost = call.myRole === "host";
  const presenter = call.participants.find((p) => p.userId === call.presenterId) ?? null;
  const nameOf = (id: string) => call.participants.find((p) => p.userId === id)?.user?.displayName ?? "Guest";

  const mutedIds = useMemo(() => {
    const s = new Set<string>();
    for (const [uid, st] of mediaStates) if (!st.micOn) s.add(uid);
    if (!media.micOn) s.add(currentUserId);
    return s;
  }, [mediaStates, media.micOn, currentUserId]);

  const speakingIds = useMemo(() => {
    const s = new Set(speakingRemote);
    if (media.speaking && media.micOn) s.add(currentUserId);
    return s;
  }, [speakingRemote, media.speaking, media.micOn, currentUserId]);

  const remoteTiles = joined.filter((p) => p.userId !== currentUserId);
  const screenStream = presenter
    ? presenter.userId === currentUserId
      ? localScreenStream
      : remoteStreams.get(presenter.userId) ?? null
    : null;

  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const QIcon = QUALITY_ICON[netQuality];

  // --- lobby --------------------------------------------------
  if (phase === "lobby" || phase === "connecting") {
    const alreadyIn = joined.filter((p) => p.userId !== currentUserId);
    return (
      <div className="flex h-full items-center justify-center bg-[#0b0d12] p-4 text-white sm:p-8">
        <div className="grid w-full max-w-4xl items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-[#15171d] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <LobbyPreview media={media} mode={mode} name={currentUserName} />
              {/* preview controls overlay */}
              <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={media.toggleMic}
                  aria-label={media.micOn ? "Mute" : "Unmute"}
                  className={cn("flex size-11 items-center justify-center rounded-full transition-colors", media.micOn ? "bg-white/15 hover:bg-white/25" : "bg-white text-[#0b0d12]")}
                >
                  {media.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
                </button>
                {mode === "video" && (
                  <button
                    type="button"
                    onClick={media.toggleCam}
                    aria-label={media.camOn ? "Turn off camera" : "Turn on camera"}
                    className={cn("flex size-11 items-center justify-center rounded-full transition-colors", media.camOn ? "bg-white/15 hover:bg-white/25" : "bg-white text-[#0b0d12]")}
                  >
                    {media.camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
                  </button>
                )}
              </div>
            </div>
            {media.error && <p className="mt-3 text-center text-sm text-amber-400">{media.error}</p>}
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xl font-bold">{call.title}</p>
              <p className="text-sm text-white/50">
                {mode === "video" ? "Video call" : "Audio call"} ·{" "}
                {alreadyIn.length > 0
                  ? `${alreadyIn.length} ${alreadyIn.length === 1 ? "person is" : "people are"} in the call`
                  : "You'll be first to join"}
              </p>
            </div>

            {alreadyIn.length > 0 && (
              <div className="flex -space-x-2">
                {alreadyIn.slice(0, 6).map((p) => (
                  <span
                    key={p.userId}
                    className="flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-[#0b0d12]"
                    style={{ background: avatarHue(p.user?.displayName ?? "?") }}
                    title={p.user?.displayName}
                  >
                    {(p.user?.displayName ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <LobbySelect label="Microphone" devices={media.mics} value={media.micId} onChange={media.setMic} />
              {mode === "video" && <LobbySelect label="Camera" devices={media.cams} value={media.camId} onChange={media.setCam} />}
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <Button size="lg" onClick={join} disabled={phase === "connecting"} className="w-full rounded-xl">
                {phase === "connecting" ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
                {phase === "connecting" ? "Connecting…" : "Join now"}
              </Button>
              <button type="button" onClick={() => router.back()} className="text-sm text-white/40 hover:text-white">
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const gridCols =
    remoteTiles.length === 0
      ? "grid-cols-1"
      : remoteTiles.length === 1
        ? "grid-cols-1 sm:grid-cols-2"
        : remoteTiles.length <= 3
          ? "grid-cols-2"
          : remoteTiles.length <= 8
            ? "grid-cols-2 lg:grid-cols-3"
            : "grid-cols-3 lg:grid-cols-4";

  const handsUp = joined.filter((p) => p.handRaised);

  // --- in call ------------------------------------------------
  return (
    <div ref={rootRef} className="flex h-full flex-col bg-[#0b0d12] text-white">
      {/* header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white/10">
            {mode === "video" ? <Video className="size-3.5" /> : <Phone className="size-3.5" />}
          </span>
          <span className="min-w-0 truncate text-sm font-semibold">{call.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 text-xs text-white/55">
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-medium tabular-nums text-white/80">{mmss}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1",
              netQuality === "good" ? "text-green-400" : netQuality === "ok" ? "text-amber-400" : "text-destructive"
            )}
            title={`Network quality: ${netQuality}`}
          >
            <QIcon className="size-3.5" />
            <span className="hidden capitalize sm:inline">{netQuality}</span>
          </span>
          {!connected && (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <WifiOff className="size-3.5" /> reconnecting
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" />
            {joined.length}
          </span>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            className="rounded-md p-1 text-white/55 hover:bg-white/10 hover:text-white"
          >
            {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* stage */}
        <div className="relative flex min-w-0 flex-1 flex-col p-3">
          {screenStream ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="min-h-0 flex-1">
                <Tile
                  name={presenter ? nameOf(presenter.userId) : "Screen"}
                  stream={screenStream}
                  muted={false}
                  speaking={false}
                  camOn
                  large
                  presenting
                  isLocal={presenter?.userId === currentUserId}
                />
              </div>
              <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
                <div className="aspect-video w-36 shrink-0">
                  <Tile name={currentUserName} stream={media.stream} muted={!media.micOn} speaking={speakingIds.has(currentUserId)} isLocal camOn={media.camOn} handRaised={handRaised} />
                </div>
                {remoteTiles.map((p) => (
                  <div key={p.userId} className="aspect-video w-36 shrink-0">
                    <Tile
                      name={nameOf(p.userId)}
                      stream={remoteStreams.get(p.userId) ?? null}
                      muted={mutedIds.has(p.userId)}
                      speaking={speakingIds.has(p.userId)}
                      camOn={mediaStates.get(p.userId)?.camOn ?? true}
                      handRaised={p.handRaised}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <div className={cn("grid w-full gap-3", gridCols)} style={{ maxHeight: "100%" }}>
                <div className="aspect-video">
                  <Tile name={currentUserName} stream={media.stream} muted={!media.micOn} speaking={speakingIds.has(currentUserId)} isLocal camOn={media.camOn} handRaised={handRaised} />
                </div>
                {remoteTiles.map((p) => (
                  <div key={p.userId} className="aspect-video">
                    <Tile
                      name={nameOf(p.userId)}
                      stream={remoteStreams.get(p.userId) ?? null}
                      muted={mutedIds.has(p.userId)}
                      speaking={speakingIds.has(p.userId)}
                      camOn={mediaStates.get(p.userId)?.camOn ?? true}
                      handRaised={p.handRaised}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* raised hands strip */}
          {handsUp.length > 0 && (
            <div className="pointer-events-none absolute left-3 top-3 flex max-w-[70%] flex-wrap gap-1.5">
              {handsUp.map((p) => (
                <span key={p.userId} className="flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-0.5 text-xs font-medium text-[#0b0d12]">
                  <Hand className="size-3" />
                  {p.userId === currentUserId ? "You" : nameOf(p.userId)}
                </span>
              ))}
            </div>
          )}

          {/* fly-up reactions */}
          <div className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center">
            <AnimatePresence>
              {reactions.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 30, scale: 0.5 }}
                  animate={{ opacity: [0, 1, 1, 0], y: -140, scale: 1.1, x: (i % 5) * 28 - 56 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 3.2, times: [0, 0.15, 0.7, 1] }}
                  className="absolute flex flex-col items-center gap-1"
                >
                  <span className="text-5xl drop-shadow-lg">{r.emoji}</span>
                  <span className="rounded-full bg-black/50 px-1.5 text-[10px] text-white">
                    {r.userId === currentUserId ? "You" : nameOf(r.userId)}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* floating controls */}
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <CallControls
              media={media}
              sharing={sharing}
              handRaised={handRaised}
              screenShareEnabled={screenShareEnabled}
              showParticipants={showSidebar && sidebarTab === "people"}
              showChat={showSidebar && sidebarTab === "chat"}
              isHost={isHost}
              onToggleShare={toggleShare}
              onToggleHand={toggleHand}
              onReaction={react}
              onToggleParticipants={() => {
                setSidebarTab("people");
                setShowSidebar((v) => (sidebarTab === "people" ? !v : true));
              }}
              onToggleChat={() => {
                setSidebarTab("chat");
                setShowSidebar((v) => (sidebarTab === "chat" ? !v : true));
              }}
              onLeave={() => leave(false)}
              onEnd={() => leave(true)}
            />
          </div>
        </div>

        {showSidebar && (
          <CallSidebar
            tab={sidebarTab}
            onTab={setSidebarTab}
            onClose={() => setShowSidebar(false)}
            participants={call.participants as SerializedCallParticipant[]}
            speakingIds={speakingIds}
            presenterId={call.presenterId}
            hostId={call.initiatedBy}
            currentUserId={currentUserId}
            mutedIds={mutedIds}
            scope={conversationScope}
          />
        )}
      </div>

      {[...peerConn.values()].some((s) => s === "connecting" || s === "new") && remoteTiles.length > 0 && (
        <p className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 text-[11px] text-white/40">Connecting…</p>
      )}
    </div>
  );
}

function LobbyPreview({ media, mode, name }: { media: ReturnType<typeof useCallMedia>; mode: "audio" | "video"; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = media.stream;
  }, [media.stream]);
  useEffect(() => {
    if (!media.stream) void media.start({ video: mode === "video" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const showVideo = mode === "video" && media.camOn && media.stream?.getVideoTracks().length;
  return (
    <>
      <video ref={ref} autoPlay playsInline muted className={cn("size-full -scale-x-100 object-cover", !showVideo && "hidden")} />
      {!showVideo && (
        <div className="flex size-full items-center justify-center">
          <span
            className="flex size-24 items-center justify-center rounded-full text-4xl font-semibold text-white"
            style={{ background: avatarHue(name) }}
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
        </div>
      )}
      {media.speaking && media.micOn && (
        <span className="pointer-events-none absolute inset-0 rounded-3xl shadow-[inset_0_0_0_3px_theme(colors.green.400)]" />
      )}
    </>
  );
}

function LobbySelect({
  label,
  devices,
  value,
  onChange,
}: {
  label: string;
  devices: { deviceId: string; label: string }[];
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/40">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
      >
        {devices.length === 0 && <option value="">Default</option>}
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId} className="bg-[#15171d]">
            {d.label}
          </option>
        ))}
      </select>
    </label>
  );
}
