/**
 * The agent runner's pure core: who runs the agents, the messages every browser exchanges over the room's data channel, the rolling transcript,
 * and the follow-up memory. AI agents are not server processes (the app is serverless), so exactly one staff member's browser runs them.
 * Everything here is deterministic given its inputs, so every browser reaches the same decision and the tests can cover fail-over.
 */
import type { MeetingUtterance, ParticipantKind } from "@/lib/dealflow-ai/meetings/types";
import type { FollowUp } from "@/lib/dealflow-ai/meetings/wake";

// ---------------------------------------------------------------------------
// Data channel protocol
// ---------------------------------------------------------------------------

export type AgentLiveState = "listening" | "thinking" | "speaking" | "muted";

export type RoomMessage =
  | { t: "utt"; u: MeetingUtterance; via: "voice" | "chat" }
  | { t: "hb"; id: string; at: number; agents: string[] }
  | { t: "as"; agentId: string; state: AgentLiveState; utteranceId?: string }
  | { t: "claim"; key: string; runner: string }
  | { t: "hand"; up: boolean }
  | { t: "agents"; muted: string[]; active: string[] }
  /** Something about the room changed (agents added, room locked ...): re-read its state now instead of waiting for the next poll. */
  | { t: "sync" };

export const DATA_TOPIC = "meeting";
export const MAX_MESSAGE_BYTES = 12_000;

export function encodeMessage(m: RoomMessage): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(JSON.stringify(m));
  if (bytes.byteLength > MAX_MESSAGE_BYTES) throw new Error("message too large");
  return bytes;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Strict parse of an incoming message: anything unexpected is dropped, never trusted structurally. */
export function decodeMessage(data: Uint8Array): RoomMessage | null {
  if (data.byteLength > MAX_MESSAGE_BYTES) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(data));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  switch (m.t) {
    case "utt": {
      const u = m.u as Record<string, unknown> | undefined;
      if (!u || typeof u !== "object") return null;
      const kind = u.speakerKind;
      if (kind !== "internal" && kind !== "external" && kind !== "agent") return null;
      const id = str(u.id, 80);
      const text = str(u.text, 2000).trim();
      if (!id || !text) return null;
      const addressed = Array.isArray(u.addressedTo) ? u.addressedTo.filter((x): x is string => typeof x === "string").slice(0, 10).map((x) => x.slice(0, 64)) : undefined;
      return {
        t: "utt",
        via: m.via === "chat" ? "chat" : "voice",
        u: { id, at: Number.isFinite(u.at) ? Number(u.at) : Date.now(), speakerId: str(u.speakerId, 80), speakerName: str(u.speakerName, 120), speakerKind: kind as ParticipantKind, text, addressedTo: addressed, final: u.final !== false },
      };
    }
    case "hb":
      return { t: "hb", id: str(m.id, 120), at: Number.isFinite(m.at) ? Number(m.at) : 0, agents: Array.isArray(m.agents) ? m.agents.filter((x): x is string => typeof x === "string").slice(0, 12) : [] };
    case "as": {
      const state = m.state;
      if (state !== "listening" && state !== "thinking" && state !== "speaking" && state !== "muted") return null;
      return { t: "as", agentId: str(m.agentId, 64), state, utteranceId: m.utteranceId ? str(m.utteranceId, 80) : undefined };
    }
    case "claim":
      return { t: "claim", key: str(m.key, 160), runner: str(m.runner, 120) };
    case "hand":
      return { t: "hand", up: m.up === true };
    case "agents":
      return {
        t: "agents",
        muted: Array.isArray(m.muted) ? m.muted.filter((x): x is string => typeof x === "string").slice(0, 12) : [],
        active: Array.isArray(m.active) ? m.active.filter((x): x is string => typeof x === "string").slice(0, 12) : [],
      };
    case "sync":
      return { t: "sync" };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Runner election
// ---------------------------------------------------------------------------

export interface RunnerCandidate {
  /** LiveKit identity (the meeting participant id). */
  identity: string;
  /** Join time in ms, from the LiveKit server (not from the client's clock). */
  joinedAt: number;
  /** An internal participant whose token allows running agents. */
  canRun: boolean;
}

export const HEARTBEAT_MS = 3000;
export const HEARTBEAT_TIMEOUT_MS = 9000;
/** A newly considered head candidate gets this long to show its first heartbeat before the next one is tried. */
export const STARTUP_GRACE_MS = 7000;

/**
 * Deterministic election: the earliest-joined eligible person who is alive. "Alive" = a heartbeat within the timeout, or still inside the start-up
 * grace after this browser first considered them. Every browser keeps its own observations but, given the same room, converges on the same person.
 * A runner that resumes heartbeating takes the role back, and the stand-in yields on seeing it (see `shouldYield`).
 */
export class RunnerElection {
  private beats = new Map<string, number>();
  private firstSeen = new Map<string, number>();

  heartbeat(identity: string, now: number): void {
    this.beats.set(identity, now);
  }

  lastBeat(identity: string): number | undefined {
    return this.beats.get(identity);
  }

  /** The runner right now, or null when nobody eligible is present. */
  elect(candidates: RunnerCandidate[], now: number, selfIdentity?: string): string | null {
    const eligible = candidates.filter((c) => c.canRun).sort((a, b) => a.joinedAt - b.joinedAt || (a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0));
    const present = new Set(eligible.map((c) => c.identity));
    for (const id of [...this.beats.keys()]) if (!present.has(id)) this.beats.delete(id);
    for (const id of [...this.firstSeen.keys()]) if (!present.has(id)) this.firstSeen.delete(id);
    for (const c of eligible) {
      if (!this.firstSeen.has(c.identity)) this.firstSeen.set(c.identity, now);
      // This browser's own liveness is certain.
      if (c.identity === selfIdentity) return c.identity;
      const beat = this.beats.get(c.identity);
      const alive = beat !== undefined ? now - beat <= HEARTBEAT_TIMEOUT_MS : now - (this.firstSeen.get(c.identity) ?? now) <= STARTUP_GRACE_MS;
      if (alive) return c.identity;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Claims (no double answers when two browsers briefly both think they run the agents)
// ---------------------------------------------------------------------------

/** A key is claimed by publishing it; if two claims collide the smaller runner identity wins. */
export class ClaimBook {
  private claims = new Map<string, string>();
  constructor(private readonly max = 800) {}

  /** Records a claim and returns the winning runner for the key. */
  claim(key: string, runner: string): string {
    const existing = this.claims.get(key);
    const winner = existing === undefined || runner < existing ? runner : existing;
    this.claims.delete(key);
    this.claims.set(key, winner);
    while (this.claims.size > this.max) {
      const oldest = this.claims.keys().next().value;
      if (oldest === undefined) break;
      this.claims.delete(oldest);
    }
    return winner;
  }

  winner(key: string): string | undefined {
    return this.claims.get(key);
  }
}

// ---------------------------------------------------------------------------
// Rolling transcript
// ---------------------------------------------------------------------------

export interface TranscriptLine {
  id: string;
  at: number;
  speakerId: string;
  speakerName: string;
  speakerKind: ParticipantKind;
  text: string;
  addressedTo: string[];
  via: "voice" | "chat";
}

/** Bounded, de-duplicated by id, kept in time order. */
export class RollingTranscript {
  private lines: TranscriptLine[] = [];
  private ids = new Set<string>();
  constructor(private readonly max = 400) {}

  add(line: TranscriptLine): boolean {
    if (this.ids.has(line.id)) return false;
    this.ids.add(line.id);
    let i = this.lines.length;
    while (i > 0 && this.lines[i - 1].at > line.at) i--;
    this.lines.splice(i, 0, line);
    while (this.lines.length > this.max) {
      const gone = this.lines.shift();
      if (gone) this.ids.delete(gone.id);
    }
    return true;
  }

  all(): readonly TranscriptLine[] {
    return this.lines;
  }

  /** The last lines before `beforeId` (or the end), capped by count and characters: what the server gets as conversation context. */
  recent(opts: { count?: number; chars?: number; untilId?: string } = {}): TranscriptLine[] {
    const count = opts.count ?? 24;
    const chars = opts.chars ?? 3500;
    let end = this.lines.length;
    if (opts.untilId) {
      const idx = this.lines.findIndex((l) => l.id === opts.untilId);
      if (idx >= 0) end = idx + 1;
    }
    const out: TranscriptLine[] = [];
    let used = 0;
    for (let i = end - 1; i >= 0 && out.length < count; i--) {
      const l = this.lines[i];
      used += l.text.length + l.speakerName.length + 4;
      if (used > chars && out.length) break;
      out.unshift(l);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Follow-up memory
// ---------------------------------------------------------------------------

/** Remembers which agent last answered which person, for the wake detector's follow-up window. Bounded. */
export class FollowUpMemory {
  private items: FollowUp[] = [];
  constructor(private readonly max = 40) {}

  record(f: FollowUp): void {
    this.items = this.items.filter((x) => !(x.agentId === f.agentId && x.toSpeakerId === f.toSpeakerId));
    this.items.push(f);
    if (this.items.length > this.max) this.items.shift();
  }

  list(): FollowUp[] {
    return this.items;
  }
}

/** What the room shows when the agents cannot answer, and why. */
export type AgentsStatus =
  | { ok: true }
  | { ok: false; code: "no-staff" | "no-agents" | "muted" | "unsupported" | "offline" | "budget" | "error"; message: string };

export function agentsStatus(input: { agentCount: number; runner: string | null; mutedAll: boolean; supported: boolean; connected: boolean; failure?: "budget" | "error" | null }): AgentsStatus {
  if (!input.agentCount) return { ok: false, code: "no-agents", message: "No AI agents are part of this meeting." };
  if (!input.connected) return { ok: false, code: "offline", message: "Reconnecting to the meeting. Agents are paused." };
  if (!input.runner) return { ok: false, code: "no-staff", message: "Waiting for a team member to join. The AI agents stay silent until one is here." };
  if (input.failure === "budget") return { ok: false, code: "budget", message: "This meeting has used up its AI speech allowance." };
  if (input.failure === "error") return { ok: false, code: "error", message: "The AI agents could not answer just now. They will try again on the next question." };
  if (!input.supported) return { ok: false, code: "unsupported", message: "This browser cannot run the AI agents. Another team member's browser will." };
  if (input.mutedAll) return { ok: false, code: "muted", message: "All AI agents are muted by the host." };
  return { ok: true };
}
