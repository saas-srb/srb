/**
 * Contract for the Meetings module (DealFlow AI). A meeting has any number of external people (clients, guests), internal people
 * (company staff) and AI voice agents (AgentOS). Everything here is data the company entered or AgentOS holds; nothing is a default persona.
 */
export type ParticipantKind = "internal" | "external" | "agent";
export type MeetingStatus = "scheduled" | "live" | "ended" | "cancelled";
export type MeetingRole = "host" | "cohost" | "participant";

export interface MeetingParticipant {
  /** Stable id inside the meeting (not the LiveKit identity). */
  id: string;
  kind: ParticipantKind;
  role: MeetingRole;
  name: string;
  /** internal: the company user id; agent: the AgentOS bot id; external: null. */
  refId: string | null;
  email?: string;
  phone?: string;
  company?: string;
  /** Optional link to a lead/applicant/client so the agents can be briefed and the result written back. */
  target?: { product: string; entityType: string; entityId: string; label: string } | null;
  /** external: the opaque personal join token hash (the raw token is shown/sent once); null otherwise. */
  joinTokenHash?: string | null;
  /** agent only: extra names people may call it by (the display name is always matched). */
  aliases?: string[];
  invitedAt: string;
  /** Last time this person was seen in the room (for the roster). */
  lastJoinedAt?: string | null;
  /** external: when the personal link stops working (meeting end + 2h); null when there is no active link. */
  joinTokenExpiresAt?: string | null;
  /** external: when the host revoked the personal link (it stays unusable until a new one is generated). */
  joinTokenRevokedAt?: string | null;
  /** How the invitation mail went (humans with an email address). */
  invite?: InviteStatus;
  /** external, waiting room: when the guest asked to come in and has not been admitted yet. */
  waitingSince?: string | null;
  /** external, waiting room: when a host let this guest in. */
  admittedAt?: string | null;
}

export type InviteState = "none" | "pending" | "sent" | "failed" | "skipped";
export interface InviteStatus {
  state: InviteState;
  at: string | null;
  /** Why it failed or was skipped (shown to the host). */
  error?: string;
  /** The calendar SEQUENCE of the last invitation sent. */
  sequence?: number;
}

/** A meeting's record of who did what (create, update, cancel, join, end ...). Capped at the latest 300 entries. */
export interface MeetingAuditEntry {
  at: string;
  actorId: string | null;
  actorName: string;
  action: "create" | "update" | "start" | "cancel" | "end" | "join" | "lock" | "unlock" | "participant_add" | "participant_remove" | "link_regenerate" | "link_revoke" | "admit" | "deny" | "invite" | "summary";
  detail?: string;
}

/** The lead / applicant / submission / client the meeting is about (so agents can be briefed and the result written back). */
export interface MeetingTarget {
  product: string;
  entityType: string;
  entityId: string;
  label: string;
}

export interface MeetingAgenda {
  title: string;
  description?: string;
  /** What the agents should help with in this meeting (shown to agents as meeting context, never as instructions to override the agent). */
  agentGoal?: string;
}

export interface MeetingDoc {
  _id?: string;
  roomId: string;
  title: string;
  agenda: MeetingAgenda | null;
  scheduledAt: string;
  durationMinutes: number;
  timezone: string;
  status: MeetingStatus;
  participants: MeetingParticipant[];
  /** Runtime behaviour set by the host when scheduling; editable while not ended. */
  agentSettings: AgentRuntimeSettings;
  recordingUrl?: string;
  transcript?: string;
  summary?: string;
  actionItems?: { text: string; owner?: string; due?: string }[];
  /** Record the meeting is about; the post-meeting result is written to its timeline once. */
  target?: MeetingTarget | null;
  /** Calendar SEQUENCE: starts at 0 and goes up on every reschedule (invitation updates replace the old one). */
  sequence?: number;
  /** Optimistic-concurrency counter for every change. */
  rev?: number;
  /** Guests wait until a host admits them. */
  waitingRoom?: boolean;
  /** New guests cannot join (hosts and listed staff still can). */
  locked?: boolean;
  startedAt?: string | null;
  endedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string;
  audit?: MeetingAuditEntry[];
  /** When the 60 and 10 minute reminders went out (each at most once). */
  remindersSent?: { m60?: string; m10?: string };
  /** The post-meeting summary was produced (or deliberately skipped) at this time; guards "summary only once". */
  postProcessedAt?: string | null;
  /** Why no summary exists (AI not connected, no transcript ...). */
  summaryNote?: string;
  /** The lead timeline entry was written (once). */
  timelineWrittenAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRuntimeSettings {
  /** Agents answer only when addressed by name (always true for now; "free" is reserved). */
  respondOnlyWhenAddressed: boolean;
  /** Seconds after an agent answered during which the same person's next sentence still counts as addressed to it. */
  followUpWindowSecs: number;
  /** Agents stop speaking when a human starts talking. */
  allowBargeIn: boolean;
  /** Max spoken seconds per answer before the agent offers to continue. */
  maxAnswerSecs: number;
  /** Include the linked lead/applicant briefing (calls/briefing) in the agents' meeting context. */
  useLeadBriefing: boolean;
}

export const DEFAULT_AGENT_RUNTIME: AgentRuntimeSettings = {
  respondOnlyWhenAddressed: true,
  followUpWindowSecs: 20,
  allowBargeIn: true,
  maxAnswerSecs: 25,
  useLeadBriefing: true,
};

/** One spoken or typed line in a meeting (published to everyone over the room's data channel and kept for the transcript). */
export interface MeetingUtterance {
  id: string;
  at: number;
  /** participant id inside the meeting */
  speakerId: string;
  speakerName: string;
  speakerKind: ParticipantKind;
  text: string;
  /** Agent ids this line was addressed to (set by the speaker's own name detection). */
  addressedTo?: string[];
  final: boolean;
}

/** What the browser may see of a participant: never the token hash. */
export interface MeetingParticipantView extends Omit<MeetingParticipant, "joinTokenHash"> {
  /** external: personal link state. */
  link: "none" | "active" | "revoked" | "expired";
}

/** The meeting as sent to the browser (client-safe: no token hashes, no audit unless the viewer may see it). */
export interface MeetingView extends Omit<MeetingDoc, "participants" | "_id"> {
  id: string;
  participants: MeetingParticipantView[];
}

export const MEETING_LIMITS = { humans: 50, agents: 10, titleMax: 200, nameMax: 120 } as const;
