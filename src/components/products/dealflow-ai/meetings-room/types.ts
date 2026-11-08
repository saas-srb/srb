import type { AgentLiveState } from "@/lib/dealflow-ai/meetings/runtime";
import type { ParticipantKind, MeetingRole } from "@/lib/dealflow-ai/meetings/types";
import type { Participant, Track } from "livekit-client";

/** An AI agent as the room shows and addresses it. `id` is the AgentOS bot id (what the server routes take); `participantId` is the roster id (what the transcript uses). */
export interface RoomAgent {
  id: string;
  participantId: string;
  name: string;
  role: string;
  available: boolean;
  icon: string | null;
  color: string | null;
  avatarUrl: string | null;
  aliases: string[];
  muted: boolean;
  state: AgentLiveState;
}

export interface RoomPerson {
  identity: string;
  name: string;
  kind: Exclude<ParticipantKind, "agent">;
  role: MeetingRole;
  runner: boolean;
  joinedAt: number;
  isLocal: boolean;
  speaking: boolean;
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  handUp: boolean;
  quality: "excellent" | "good" | "poor" | "lost" | "unknown";
  /** The LiveKit participant, for attaching video. */
  participant: Participant;
  videoSource: Track.Source | null;
}

export interface ChatLine {
  id: string;
  at: number;
  speakerId: string;
  speakerName: string;
  speakerKind: ParticipantKind;
  text: string;
  addressedTo: string[];
  via: "voice" | "chat";
  interim?: boolean;
}

export type Layout = "gallery" | "spotlight";
export type PanelTab = "transcript" | "chat" | "people";
export type ConnState = "lobby" | "connecting" | "connected" | "reconnecting" | "ended" | "failed" | "duplicate";

export interface RoomLiveState {
  locked: boolean;
  waitingRoom: boolean;
  status: string;
  waiting: Array<{ id: string; name: string; since: string }>;
  availableAgents: Array<{ id: string; name: string; category: string }>;
}
