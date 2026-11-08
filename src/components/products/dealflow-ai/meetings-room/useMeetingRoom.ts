"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ConnectionQuality, DisconnectReason, Room, RoomEvent, Track, type Participant, type RemoteParticipant } from "livekit-client";
import type { MeetingRoomProps } from "@/lib/dealflow-ai/meetings/room-props";
import type { MeetingUtterance } from "@/lib/dealflow-ai/meetings/types";
import { detectAddressed } from "@/lib/dealflow-ai/meetings/wake";
import {
  DATA_TOPIC, HEARTBEAT_MS, FollowUpMemory, RollingTranscript, RunnerElection, agentsStatus, decodeMessage, encodeMessage,
  type AgentLiveState, type RoomMessage,
} from "@/lib/dealflow-ai/meetings/runtime";
import { isEchoOfAgent, type SttOutcome } from "@/lib/dealflow-ai/meetings/transcribe";
import { AgentAudioHub, AGENT_TRACK_PREFIX } from "./AgentAudio";
import { AgentRunner } from "./AgentRunner";
import { MicTranscriber } from "./MicTranscriber";
import type { ChatLine, ConnState, RoomAgent, RoomLiveState, RoomPerson } from "./types";

/**
 * The room engine as a hook: LiveKit connection and reconnection, the participant list, the data channel (lines, hand raises, runner heartbeats,
 * agent states), this person's speech capture, the runner election and, on the elected staff browser, the AI agents.
 */

interface Meta {
  kind: "internal" | "external";
  role: "host" | "cohost" | "participant";
  runner: boolean;
}

function parseMeta(p: Participant): Meta {
  try {
    const m = JSON.parse(p.metadata || "{}") as Record<string, unknown>;
    return {
      kind: m.kind === "internal" ? "internal" : "external",
      role: m.role === "host" || m.role === "cohost" ? m.role : "participant",
      runner: m.runner === true,
    };
  } catch {
    return { kind: "external", role: "participant", runner: false };
  }
}

const QUALITY: Record<string, RoomPerson["quality"]> = {
  [ConnectionQuality.Excellent]: "excellent",
  [ConnectionQuality.Good]: "good",
  [ConnectionQuality.Poor]: "poor",
  [ConnectionQuality.Lost]: "lost",
};

export interface Devices {
  audioinput: MediaDeviceInfo[];
  videoinput: MediaDeviceInfo[];
  audiooutput: MediaDeviceInfo[];
}

export interface JoinOptions {
  mic: boolean;
  cam: boolean;
  micDeviceId?: string;
  camDeviceId?: string;
}

const rid = () => Math.random().toString(36).slice(2, 8);
const jwtExp = (t: string): number | null => {
  try {
    const part = t.split(".")[1];
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
};

export function useMeetingRoom(props: MeetingRoomProps) {
  const { meeting, me, token, liveKit, canRunAgents, canHost } = props;
  const settings = meeting.agentSettings;

  const [conn, setConn] = useState<ConnState>("lobby");
  const [connError, setConnError] = useState<string | null>(null);
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [interim, setInterim] = useState<ChatLine | null>(null);
  const [hands, setHands] = useState<Set<string>>(new Set());
  const [mutedAgents, setMutedAgents] = useState<Set<string>>(new Set());
  const [agentStates, setAgentStates] = useState<Record<string, AgentLiveState>>({});
  const [runnerId, setRunnerId] = useState<string | null>(null);
  const [agentFailure, setAgentFailure] = useState<"budget" | "error" | null>(null);
  const [liveState, setLiveState] = useState<RoomLiveState>({ locked: !!meeting.locked, waitingRoom: !!meeting.waitingRoom, status: meeting.status, waiting: [], availableAgents: [] });
  const [agentRows, setAgentRows] = useState<Array<Omit<RoomAgent, "muted" | "state">>>(() =>
    meeting.participants
      .filter((p) => p.kind === "agent" && p.refId)
      .map((p) => ({ id: p.refId as string, participantId: p.id, name: p.name, role: "", available: true, icon: null, color: null, avatarUrl: null, aliases: p.aliases ?? [] })),
  );
  const [micError, setMicError] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [devices, setDevices] = useState<Devices>({ audioinput: [], videoinput: [], audiooutput: [] });
  const [localLevel, setLocalLevel] = useState(0);
  const [tokenExpiring, setTokenExpiring] = useState(false);
  const [sttBlocked, setSttBlocked] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const transcript = useRef(new RollingTranscript(2000));
  const followUps = useRef(new FollowUpMemory());
  const election = useRef(new RunnerElection());
  const runnerRef = useRef<AgentRunner | null>(null);
  const hubRef = useRef<AgentAudioHub | null>(null);
  const micRef = useRef<MicTranscriber | null>(null);
  const agentsRef = useRef<RoomAgent[]>([]);
  const statesRef = useRef<Record<string, AgentLiveState>>({});
  const mutedRef = useRef<Set<string>>(new Set());
  const lastHostMuteAt = useRef(0);
  const localVad = useRef(false);
  const remoteVoice = useRef(false);
  const leftRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const persistQueue = useRef<MeetingUtterance[]>([]);
  const persisting = useRef(false);
  const joinOptsRef = useRef<JoinOptions>({ mic: true, cam: false });
  const tokenRef = useRef(token);
  const recentAgentText = useRef<Array<{ at: number; text: string }>>([]);

  // ------------------------------------------------------------------ derived
  const agents: RoomAgent[] = useMemo(
    () => agentRows.map((a) => ({ ...a, muted: mutedAgents.has(a.id), state: mutedAgents.has(a.id) ? "muted" : agentStates[a.id] ?? "listening" })),
    [agentRows, mutedAgents, agentStates],
  );
  useEffect(() => {
    agentsRef.current = agents;
    statesRef.current = agentStates;
    mutedRef.current = mutedAgents;
  }, [agents, agentStates, mutedAgents]);

  const people: RoomPerson[] = useMemo(() => {
    const r = room;
    if (!r) return [];
    const all: Participant[] = [r.localParticipant, ...r.remoteParticipants.values()];
    return all
      .map((p): RoomPerson => {
        const meta = parseMeta(p);
        const sharing = p.isScreenShareEnabled;
        return {
          identity: p.identity,
          name: p.name || meeting.participants.find((x) => x.id === p.identity)?.name || "Guest",
          kind: p === r.localParticipant ? me.kind : meta.kind,
          role: p === r.localParticipant ? me.role : meta.role,
          runner: p === r.localParticipant ? canRunAgents : meta.runner,
          joinedAt: p.joinedAt?.getTime() ?? 0,
          isLocal: p === r.localParticipant,
          speaking: p.isSpeaking,
          micOn: p.isMicrophoneEnabled,
          camOn: p.isCameraEnabled,
          sharing,
          handUp: hands.has(p.identity),
          quality: QUALITY[p.connectionQuality] ?? "unknown",
          participant: p,
          videoSource: sharing ? Track.Source.ScreenShare : p.isCameraEnabled ? Track.Source.Camera : null,
        };
      })
      .filter((p) => !p.identity.startsWith(AGENT_TRACK_PREFIX))
      .sort((a, b) => (a.isLocal ? -1 : b.isLocal ? 1 : a.joinedAt - b.joinedAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, conn, hands, version, meeting.participants, me.kind, me.role, canRunAgents]);

  const refresh = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      bump();
    });
  }, []);

  const status = agentsStatus({
    agentCount: agentRows.filter((a) => a.available).length,
    runner: runnerId,
    mutedAll: agentRows.length > 0 && agentRows.every((a) => mutedAgents.has(a.id) || !a.available),
    supported: !canRunAgents || AgentAudioHub.supported(),
    connected: conn === "connected",
    failure: agentFailure,
  });

  // ------------------------------------------------------------------ lines
  const addLine = useCallback((l: ChatLine) => {
    const t = transcript.current;
    const added = t.add({ id: l.id, at: l.at, speakerId: l.speakerId, speakerName: l.speakerName, speakerKind: l.speakerKind, text: l.text, addressedTo: l.addressedTo, via: l.via });
    if (!added) return false;
    setLines(t.all().map((x) => ({ ...x })));
    if (l.speakerKind === "agent") {
      recentAgentText.current.push({ at: l.at, text: l.text });
      if (recentAgentText.current.length > 12) recentAgentText.current.shift();
    }
    return true;
  }, []);

  const send = useCallback((m: RoomMessage, reliable = true) => {
    const r = roomRef.current;
    if (!r || r.state !== "connected") return;
    try {
      void r.localParticipant.publishData(encodeMessage(m), { reliable, topic: DATA_TOPIC }).catch(() => {});
    } catch {
      /* too large or closed: dropped */
    }
  }, []);

  // Stored lines are retried in order; the id makes a repeat harmless.
  const persist = useCallback((u: MeetingUtterance) => {
    persistQueue.current.push(u);
    if (persistQueue.current.length > 200) persistQueue.current.shift();
    if (persisting.current) return;
    persisting.current = true;
    void (async () => {
      let delay = 800;
      while (persistQueue.current.length && !leftRef.current) {
        const next = persistQueue.current[0];
        try {
          const res = await fetch(`/api/dealflow-ai/meetings/${encodeURIComponent(meeting.roomId)}/utterances`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenRef.current}` },
            body: JSON.stringify({ id: next.id, at: next.at, speakerId: next.speakerId, text: next.text, addressedTo: next.addressedTo ?? [] }),
          });
          if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408)) {
            if (res.status === 401) setTokenExpiring(true);
            persistQueue.current.shift();
            delay = 800;
            continue;
          }
        } catch {
          /* offline: retry */
        }
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(10_000, delay * 2);
      }
      persisting.current = false;
    })();
  }, [meeting.roomId]);

  /** A line from this person (spoken or typed). */
  const submitLine = useCallback(
    (text: string, via: "voice" | "chat", opts: { id?: string; at?: number } = {}) => {
      const clean = text.replace(/\s+/g, " ").trim().slice(0, 1500);
      if (!clean) return;
      const live = agentsRef.current.filter((a) => a.available && !a.muted);
      const others = (roomRef.current ? [...roomRef.current.remoteParticipants.values()] : []).map((p) => p.name || "").filter(Boolean);
      const wake = detectAddressed({
        text: clean,
        speaker: { id: me.participantId, kind: me.kind },
        agents: live.map((a) => ({ id: a.id, name: a.name, aliases: a.aliases })),
        now: Date.now(),
        followUps: followUps.current.list(),
        followUpWindowSecs: settings.followUpWindowSecs,
        humanNames: others,
      });
      const u: MeetingUtterance = {
        id: opts.id ?? `c-${me.participantId.slice(0, 20)}-${Date.now().toString(36)}-${rid()}`,
        at: opts.at ?? Date.now(),
        speakerId: me.participantId,
        speakerName: me.name,
        speakerKind: me.kind,
        text: clean,
        addressedTo: wake.agentIds,
        final: true,
      };
      addLine({ ...u, addressedTo: u.addressedTo ?? [], via });
      send({ t: "utt", u, via });
      persist(u);
      runnerRef.current?.onLine(u);
    },
    [addLine, me, persist, send, settings.followUpWindowSecs],
  );

  // ------------------------------------------------------------------ agent state (runner side)
  const setAgentState = useCallback(
    (agentId: string, state: AgentLiveState, utteranceId?: string) => {
      setAgentStates((s) => (s[agentId] === state ? s : { ...s, [agentId]: state }));
      send({ t: "as", agentId, state, utteranceId });
    },
    [send],
  );

  const publishAgentLine = useCallback(
    (u: MeetingUtterance) => {
      addLine({ ...u, addressedTo: u.addressedTo ?? [], via: "voice" });
      send({ t: "utt", u, via: "voice" });
      persist(u);
    },
    [addLine, persist, send],
  );

  // ------------------------------------------------------------------ live state polling (agents, lock, waiting guests)
  const pollState = useCallback(async () => {
    try {
      const res = await fetch(`/api/dealflow-ai/meetings/room-control?roomId=${encodeURIComponent(meeting.roomId)}`, { headers: { Authorization: `Bearer ${tokenRef.current}` }, cache: "no-store" });
      if (res.status === 401) return;
      const j = await res.json();
      if (!res.ok || !j?.ok) return;
      setAgentRows(
        (j.agents as Array<Record<string, unknown>>).map((a) => ({
          id: String(a.id),
          participantId: String(a.participantId),
          name: String(a.name),
          role: String(a.role ?? ""),
          available: a.available === true,
          icon: (a.icon as string) ?? null,
          color: (a.color as string) ?? null,
          avatarUrl: (a.avatarUrl as string) ?? null,
          aliases: Array.isArray(a.aliases) ? (a.aliases as string[]) : [],
        })),
      );
      setLiveState({ locked: !!j.locked, waitingRoom: !!j.waitingRoom, status: String(j.status), waiting: j.waiting ?? [], availableAgents: j.availableAgents ?? [] });
      if (j.status === "ended") setConn((c) => (c === "connected" || c === "reconnecting" ? "ended" : c));
    } catch {
      /* the next poll will try again */
    }
  }, [meeting.roomId]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/dealflow-ai/meetings/${encodeURIComponent(meeting.roomId)}/utterances`, { cache: "no-store" });
      if (!res.ok) return; // guests cannot read the stored transcript; they see lines from when they joined
      const j = (await res.json()) as { lines?: MeetingUtterance[] };
      for (const u of (j.lines ?? []).slice(-300)) {
        addLine({ ...u, addressedTo: u.addressedTo ?? [], via: u.id.startsWith("c-") ? "chat" : "voice" });
      }
    } catch {
      /* optional */
    }
  }, [addLine, meeting.roomId]);

  const refreshDevices = useCallback(async () => {
    try {
      const [audioinput, videoinput, audiooutput] = await Promise.all([Room.getLocalDevices("audioinput"), Room.getLocalDevices("videoinput"), Room.getLocalDevices("audiooutput")]);
      setDevices({ audioinput, videoinput, audiooutput });
    } catch {
      /* no permission yet */
    }
  }, []);

  const recover = useCallback(async () => {
    setConn("reconnecting");
    for (let attempt = 0; attempt < 5 && !leftRef.current; attempt++) {
      await new Promise((r) => setTimeout(r, Math.min(15_000, 1500 * 2 ** attempt)));
      if (leftRef.current) return;
      const r = roomRef.current;
      if (!r) return;
      try {
        await r.connect(liveKit.url, tokenRef.current, { autoSubscribe: true });
        setConn("connected");
        const o = joinOptsRef.current;
        if (o.mic) await r.localParticipant.setMicrophoneEnabled(true).catch(() => {});
        if (o.cam) await r.localParticipant.setCameraEnabled(true).catch(() => {});
        return;
      } catch {
        /* try again */
      }
    }
    if (!leftRef.current) {
      setConnError("The connection to the meeting was lost.");
      setConn("failed");
    }
  }, [liveKit.url]);

  // ------------------------------------------------------------------ incoming data
  const onData = useCallback(
    (payload: Uint8Array, sender?: RemoteParticipant) => {
      const msg = decodeMessage(payload);
      if (!msg || !sender) return;
      const meta = parseMeta(sender);
      switch (msg.t) {
        case "utt": {
          const u = msg.u;
          if (u.speakerKind === "agent") {
            // Only the runner (an internal participant whose token allows it) may speak for an agent, and only for a listed one.
            const agent = agentsRef.current.find((a) => a.participantId === u.speakerId);
            if (!meta.runner || meta.kind !== "internal" || !agent) return;
            if (addLine({ ...u, speakerName: agent.name, addressedTo: u.addressedTo ?? [], via: "voice" })) {
              followUps.current.record({ agentId: agent.id, at: u.at, toSpeakerId: u.addressedTo?.[0] ?? "" });
              const base = u.id.startsWith("ag-") ? u.id.slice(3) : u.id;
              const [utt, bot] = base.split(":");
              if (utt && bot) runnerRef.current?.markHandled(utt, bot);
            }
            return;
          }
          // A person speaks only as themselves: the name and kind come from the server-set room data, not from the message.
          const line: ChatLine = { ...u, speakerId: sender.identity, speakerName: sender.name || u.speakerName, speakerKind: meta.kind, addressedTo: u.addressedTo ?? [], via: msg.via };
          if (addLine(line)) runnerRef.current?.onLine({ ...u, speakerId: sender.identity, speakerKind: meta.kind });
          return;
        }
        case "hb":
          election.current.heartbeat(sender.identity, Date.now());
          if (Date.now() - lastHostMuteAt.current > 4000 && meta.runner) {
            const next = new Set(msg.agents);
            if (next.size !== mutedRef.current.size || [...next].some((x) => !mutedRef.current.has(x))) setMutedAgents(next);
          }
          return;
        case "as":
          if (!meta.runner) return;
          setAgentStates((s) => (s[msg.agentId] === msg.state ? s : { ...s, [msg.agentId]: msg.state }));
          return;
        case "claim":
          runnerRef.current?.observeClaim(msg.key, sender.identity);
          return;
        case "hand":
          setHands((h) => {
            const n = new Set(h);
            if (msg.up) n.add(sender.identity);
            else n.delete(sender.identity);
            return n;
          });
          return;
        case "agents":
          // Only a host or co-host may mute agents.
          if (meta.role === "participant") return;
          lastHostMuteAt.current = Date.now();
          setMutedAgents(new Set(msg.muted));
          return;
        case "sync":
          void pollState();
          return;
      }
    },
    // pollState is declared below and stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addLine],
  );

  // ------------------------------------------------------------------ speech capture
  const attachMic = useCallback(async () => {
    const r = roomRef.current;
    const mic = micRef.current;
    if (!r || !mic) return;
    const pub = r.localParticipant.getTrackPublication(Track.Source.Microphone);
    const mst = pub?.track && !pub.isMuted ? pub.track.mediaStreamTrack : null;
    await mic.setTrack(mst ?? null);
  }, []);

  const onStt = useCallback(
    (o: SttOutcome) => {
      if (o.kind === "text") {
        const agentLines = recentAgentText.current.filter((x) => Date.now() - x.at < 25_000).map((x) => x.text);
        if (o.clip.playbackOverlap > 0.2 && isEchoOfAgent(o.text, agentLines)) return; // the agent's own voice heard through a speaker
        submitLine(o.text, "voice", { id: o.clip.id, at: o.clip.startedAt });
      } else if (o.kind === "auth-expired") setTokenExpiring(true);
      else if (o.kind === "blocked") setSttBlocked(o.message);
    },
    [submitLine],
  );

  const humanVoice = useCallback(() => runnerRef.current?.humanVoice(localVad.current || remoteVoice.current), []);

  // ------------------------------------------------------------------ connect
  const connect = useCallback(
    async (opts: JoinOptions) => {
      if (roomRef.current) return;
      joinOptsRef.current = opts;
      leftRef.current = false;
      setConn("connecting");
      setConnError(null);
      const r = new Room({
        adaptiveStream: true,
        dynacast: true,
        stopLocalTrackOnUnpublish: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, deviceId: opts.micDeviceId },
        videoCaptureDefaults: { deviceId: opts.camDeviceId, resolution: { width: 1280, height: 720, frameRate: 24 } },
        publishDefaults: { dtx: true, red: true, simulcast: true },
      });
      roomRef.current = r;
      setRoom(r);

      r.on(RoomEvent.ParticipantConnected, refresh)
        .on(RoomEvent.ParticipantDisconnected, (p) => {
          setHands((h) => {
            if (!h.has(p.identity)) return h;
            const n = new Set(h);
            n.delete(p.identity);
            return n;
          });
          refresh();
        })
        .on(RoomEvent.TrackSubscribed, refresh)
        .on(RoomEvent.TrackUnsubscribed, refresh)
        .on(RoomEvent.TrackMuted, () => {
          refresh();
          void attachMic();
        })
        .on(RoomEvent.TrackUnmuted, () => {
          refresh();
          void attachMic();
        })
        .on(RoomEvent.LocalTrackPublished, () => {
          refresh();
          void attachMic();
        })
        .on(RoomEvent.LocalTrackUnpublished, () => {
          refresh();
          void attachMic();
        })
        .on(RoomEvent.ParticipantMetadataChanged, refresh)
        .on(RoomEvent.ConnectionQualityChanged, refresh)
        .on(RoomEvent.ActiveDeviceChanged, () => void attachMic())
        .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          refresh();
          // Barge-in watches other people only: this device's own voice is watched by its own detector.
          remoteVoice.current = speakers.some((p) => !p.isLocal);
          humanVoice();
        })
        .on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
          if (topic === DATA_TOPIC) onData(payload, participant);
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!r.canPlaybackAudio))
        .on(RoomEvent.MediaDevicesError, (e) => setMicError(e instanceof Error ? e.message : "Could not use the camera or microphone."))
        .on(RoomEvent.Reconnecting, () => setConn("reconnecting"))
        .on(RoomEvent.Reconnected, () => {
          setConn("connected");
          void attachMic();
          void pollState();
        })
        .on(RoomEvent.Disconnected, (reason) => {
          if (leftRef.current) return;
          if (reason === DisconnectReason.DUPLICATE_IDENTITY) return setConn("duplicate");
          if (reason === DisconnectReason.ROOM_DELETED) return setConn("ended");
          if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
            setConnError("The host removed you from this meeting.");
            return setConn("failed");
          }
          void recover();
        });

      try {
        await r.connect(liveKit.url, tokenRef.current, { autoSubscribe: true, maxRetries: 3 });
      } catch (e) {
        roomRef.current = null;
        setRoom(null);
        setConnError(e instanceof Error ? e.message : "Could not connect to the meeting.");
        setConn("failed");
        return;
      }
      setConn("connected");
      setAudioBlocked(!r.canPlaybackAudio);
      void r.startAudio().catch(() => {});

      // Devices: a refusal leaves the person in the meeting, listening and able to chat.
      try {
        if (opts.mic) await r.localParticipant.setMicrophoneEnabled(true);
      } catch (e) {
        setMicError(e instanceof Error && /denied|permission|NotAllowed/i.test(e.message) ? "Microphone access is blocked. You can listen and chat; allow the microphone in your browser to speak." : "Could not start your microphone.");
      }
      try {
        if (opts.cam) await r.localParticipant.setCameraEnabled(true);
      } catch {
        /* camera is optional */
      }
      refresh();
      void refreshDevices();
      void pollState();
      void loadHistory();
    },
    // helpers below are stable refs/callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveKit.url, onData, refresh, attachMic, humanVoice, pollState],
  );

  // ------------------------------------------------------------------ speech capture lifecycle
  useEffect(() => {
    if (conn !== "connected" || micRef.current) return;
    const mic = new MicTranscriber({
      roomId: meeting.roomId,
      participantId: me.participantId,
      token: tokenRef.current,
      language: "",
      playbackActive: () => Object.values(statesRef.current).includes("speaking"),
      onSpeechStart: () => {
        localVad.current = true;
        humanVoice();
      },
      onSpeechEnd: () => {
        localVad.current = false;
        humanVoice();
      },
      onOutcome: onStt,
      onLevel: (v) => setLocalLevel(v),
    });
    micRef.current = mic;
    void attachMic();
    const onVis = () => void mic.nudge();
    document.addEventListener("visibilitychange", onVis);
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
    };
  }, [conn, meeting.roomId, me.participantId, attachMic, humanVoice, onStt, refreshDevices]);

  // ------------------------------------------------------------------ election, heartbeat, runner lifecycle
  useEffect(() => {
    if (conn !== "connected") return;
    const supported = canRunAgents && AgentAudioHub.supported();
    const t = setInterval(() => {
      const r = roomRef.current;
      if (!r) return;
      const cands = [r.localParticipant, ...r.remoteParticipants.values()]
        .map((p) => ({ p, meta: parseMeta(p) }))
        .filter(({ meta, p }) => meta.kind === "internal" && (p === r.localParticipant ? supported : meta.runner))
        .map(({ p }) => ({ identity: p.identity, joinedAt: p.joinedAt?.getTime() ?? Number.MAX_SAFE_INTEGER, canRun: true }));
      const elected = election.current.elect(cands, Date.now(), me.participantId);
      setRunnerId((cur) => (cur === elected ? cur : elected));
    }, 1000);
    return () => clearInterval(t);
  }, [conn, canRunAgents, me.participantId]);

  const iAmRunner = runnerId === me.participantId && canRunAgents;
  const hasAgents = agentRows.length > 0;
  useEffect(() => {
    const r = roomRef.current;
    if (!iAmRunner || !r || conn !== "connected" || !hasAgents || !AgentAudioHub.supported()) return;
    const hub = new AgentAudioHub(r);
    hubRef.current = hub;
    void hub.resume();
    const runner = new AgentRunner({
      roomId: meeting.roomId,
      selfId: me.participantId,
      settings,
      hub,
      transcript: transcript.current,
      followUps: followUps.current,
      agents: () => agentsRef.current,
      humanNames: () => (roomRef.current ? [...roomRef.current.remoteParticipants.values()].map((p) => p.name || "").filter(Boolean) : []),
      send,
      publishAgentLine,
      setAgentState,
      onFailure: (k) => setAgentFailure(k === "ok" ? null : k),
    });
    runnerRef.current = runner;
    // Lines that arrived before this browser became the runner were handled (or deliberately skipped) by the previous one.
    for (const l of transcript.current.all()) if (l.speakerKind === "agent") {
      const base = l.id.startsWith("ag-") ? l.id.slice(3) : l.id;
      const [utt, bot] = base.split(":");
      if (utt && bot) runner.markHandled(utt, bot);
    }
    for (const l of transcript.current.all()) for (const a of agentsRef.current) runner.markHandled(l.id, a.id);
    runner.start();
    const beat = () => send({ t: "hb", id: me.participantId, at: Date.now(), agents: [...mutedRef.current] }, false);
    beat();
    const hb = setInterval(beat, HEARTBEAT_MS);
    return () => {
      clearInterval(hb);
      runner.stop();
      runnerRef.current = null;
      void hub.dispose();
      hubRef.current = null;
      setAgentStates({});
    };
  }, [iAmRunner, conn, hasAgents, meeting.roomId, me.participantId, settings, send, publishAgentLine, setAgentState]);

  // A muted agent stops mid-sentence and forgets what it had queued.
  useEffect(() => {
    if (!iAmRunner) return;
    for (const id of mutedAgents) runnerRef.current?.muteAgent(id);
  }, [mutedAgents, iAmRunner]);

  // Poll the room state; sooner when a host is watching the waiting room.
  useEffect(() => {
    if (conn !== "connected") return;
    const t = setInterval(() => void pollState(), canHost ? 5000 : 12_000);
    return () => clearInterval(t);
  }, [conn, canHost, pollState]);

  // Warn before the room token (and so the STT / transcript calls) expires.
  useEffect(() => {
    const exp = jwtExp(token);
    if (!exp) return;
    const ms = exp - Date.now() - 5 * 60_000;
    const t = setTimeout(() => setTokenExpiring(true), Math.max(0, Math.min(ms, 2 ** 31 - 1)));
    return () => clearTimeout(t);
  }, [token]);

  // ------------------------------------------------------------------ actions
  const setMic = useCallback(async (on: boolean) => {
    const r = roomRef.current;
    if (!r) return;
    try {
      await r.localParticipant.setMicrophoneEnabled(on);
      setMicError(null);
    } catch {
      setMicError("Microphone access is blocked. Allow it in your browser to speak.");
    }
    refresh();
  }, [refresh]);

  const setCam = useCallback(async (on: boolean) => {
    try {
      await roomRef.current?.localParticipant.setCameraEnabled(on);
    } catch {
      setMicError("Camera access is blocked. Allow it in your browser to share video.");
    }
    refresh();
  }, [refresh]);

  const toggleShare = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    try {
      await r.localParticipant.setScreenShareEnabled(!r.localParticipant.isScreenShareEnabled, { audio: false });
    } catch {
      /* the person cancelled the picker */
    }
    refresh();
  }, [refresh]);

  const toggleHand = useCallback(() => {
    const up = !hands.has(me.participantId);
    setHands((h) => {
      const n = new Set(h);
      if (up) n.add(me.participantId);
      else n.delete(me.participantId);
      return n;
    });
    send({ t: "hand", up });
  }, [hands, me.participantId, send]);

  const switchDevice = useCallback(
    async (kind: MediaDeviceKind, id: string) => {
      try {
        await roomRef.current?.switchActiveDevice(kind, id);
        if (kind === "audioinput") setTimeout(() => void attachMic(), 300);
        refresh();
      } catch {
        setMicError("Could not switch to that device.");
      }
    },
    [attachMic, refresh],
  );

  const control = useCallback(
    async (body: Record<string, unknown>): Promise<string | null> => {
      try {
        const res = await fetch("/api/dealflow-ai/meetings/room-control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: meeting.roomId, ...body }) });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.ok) return (j?.error as string) || "That did not work.";
        send({ t: "sync" });
        void pollState();
        return null;
      } catch {
        return "Network problem. Try again.";
      }
    },
    [meeting.roomId, pollState, send],
  );

  const setAgentMuted = useCallback(
    (agentId: string, muted: boolean) => {
      const next = new Set(mutedRef.current);
      if (muted) next.add(agentId);
      else next.delete(agentId);
      lastHostMuteAt.current = Date.now();
      setMutedAgents(next);
      send({ t: "agents", muted: [...next], active: agentsRef.current.map((a) => a.id) });
    },
    [send],
  );

  const leave = useCallback(async () => {
    leftRef.current = true;
    runnerRef.current?.stop();
    await hubRef.current?.dispose().catch(() => {});
    await micRef.current?.dispose().catch(() => {});
    micRef.current = null;
    const r = roomRef.current;
    roomRef.current = null;
    try {
      await r?.localParticipant.setCameraEnabled(false).catch(() => {});
      await r?.localParticipant.setMicrophoneEnabled(false).catch(() => {});
    } finally {
      await r?.disconnect(true).catch(() => {});
    }
  }, []);

  const startAudio = useCallback(async () => {
    try {
      await roomRef.current?.startAudio();
      setAudioBlocked(false);
    } catch {
      /* still blocked: the banner stays */
    }
  }, []);
  const clearMicError = useCallback(() => setMicError(null), []);
  const clearStt = useCallback(() => setSttBlocked(null), []);

  // Clean up when the page is closed or the component unmounts.
  useEffect(() => {
    const onHide = () => {
      leftRef.current = true;
      void roomRef.current?.disconnect(true);
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      leftRef.current = true;
      runnerRef.current?.stop();
      void hubRef.current?.dispose();
      void micRef.current?.dispose();
      micRef.current = null;
      void roomRef.current?.disconnect(true);
      roomRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    conn, connError, room, version, people, agents, lines, interim, setInterim, hands, status, runnerId, iAmRunner, liveState, devices, micError, audioBlocked, localLevel, tokenExpiring, sttBlocked,
    connect, leave, submitLine, setMic, setCam, toggleShare, toggleHand, switchDevice, control, setAgentMuted, refreshDevices,
    startAudio,
    clearMicError,
    clearStt,
  };
}
