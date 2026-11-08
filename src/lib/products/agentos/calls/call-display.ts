import { maskPhone } from "@/lib/products/agentos/calls/phone";
import type { CallDirection } from "@/lib/products/agentos/calls/types";

/** Pure wording and decisions for the Call History pages and the recording route (client-safe; unit-tested in scripts/test-voice-ui-followup.ts). */

export const DIRECTION_LABEL: Record<CallDirection, string> = { outbound: "Outbound", inbound: "Inbound", web: "Web", web_public: "Website visitor" };

/** The number a list shows for a call: inbound callers are masked when the company asks for it; numbers we dialed are shown as stored. */
export function listedPhone(c: { direction: CallDirection; phone: string | null }, maskInbound: boolean): string | null {
  if (!c.phone) return null;
  return c.direction === "inbound" && maskInbound ? maskPhone(c.phone) : c.phone;
}

/** Who a row is "about" when no record is linked: the contact, the masked caller, or the website visitor. */
export function callerName(c: { direction: CallDirection; phone: string | null; target: { label: string } | null; visitorName?: string | null }, maskInbound: boolean): string | null {
  if (c.target?.label) return c.target.label;
  if (c.direction === "web_public") return c.visitorName || "Website visitor";
  if (c.direction === "inbound") return listedPhone(c, maskInbound) ?? "Unknown caller";
  return null;
}

export type SpeakerLine = { role: "agent" | "user"; speaker?: "lead" | "ai" | "human" };

/** Who spoke a transcript line: the recorded speaker on conference calls, else the role (the person on the other end is the caller). */
export function speakerName(line: SpeakerLine, call: { direction: CallDirection }, agentName: string): string {
  if (line.speaker === "human") return "Team member";
  if (line.speaker === "ai") return agentName;
  if (line.speaker === "lead") return call.direction === "outbound" ? "Lead" : call.direction === "web_public" ? "Visitor" : "Caller";
  return line.role === "agent" ? agentName : call.direction === "web_public" ? "Visitor" : "Caller";
}

export interface RecordingFacts {
  status: string;
  conversationId: string | null;
  hasAudio: boolean | null;
  /** The call went through a conference or a person took over at some point. */
  conference: boolean;
}

export interface RecordingInfo {
  available: boolean;
  /** Said under the player (or instead of it). Never claims the recording holds the team member's voice. */
  note: string | null;
}

const LIVE = ["scheduled", "dialing", "in_progress"];

/** Whether the call has a recording to play and what to tell the person about it. */
export function recordingInfo(c: RecordingFacts): RecordingInfo {
  if (LIVE.includes(c.status)) return { available: false, note: "The recording is available once the call has ended." };
  if (!c.conversationId) return { available: false, note: null };
  if (c.hasAudio === false) return { available: false, note: "ElevenLabs has no recording for this call. It may not have been recorded, or it is past the retention period." };
  return {
    available: true,
    note: c.conference
      ? "This is the recording ElevenLabs made of the AI agent's side of the call. It does not include what a team member said while they were in control, and the AI does not hear anything while it is on hold."
      : null,
  };
}

export type AudioDecision = "allow" | "deny";

/** Same rule as the call page: the person who placed the call, or anyone with call oversight (VIEW_CHATS / call management). */
export function audioAccess(v: { userId: string; oversight: boolean }, call: { initiatedByUserId: string | null }): AudioDecision {
  return call.initiatedByUserId === v.userId || v.oversight ? "allow" : "deny";
}

/** The one-line state of the live-call setup: ready, or what is still missing (the labels of the steps not done). */
export function setupSummary(steps: readonly { label: string; done: boolean }[]): { ready: boolean; missing: string[] } {
  const missing = steps.filter((s) => !s.done).map((s) => s.label);
  return { ready: missing.length === 0, missing };
}

/** Plain-language names for the abuse log entries shown in the website-calls overview. */
export const ABUSE_LABEL: Record<string, string> = {
  kill_switch: "Refused: website calls switched off",
  bad_token: "Refused: invalid start token",
  expired_token: "Refused: expired start token",
  too_fast: "Refused: started too quickly after the page loaded",
  replay: "Refused: reused start token",
  wrong_address: "Refused: token from a different address",
  origin_denied: "Refused: website not on the agent's allowed list",
  ip_limit: "Refused: too many calls from one address",
  agent_limit: "Refused: too many calls to one agent",
  cap_exhausted: "Refused: daily minutes used up",
  bad_input: "Refused: invalid request",
  no_consent: "Refused: visitor had not agreed",
  bad_session_key: "Refused: session key mismatch",
  foreign_conversation: "Refused: conversation not from this session",
};

/** The abuse counts as sorted lines (largest first) plus the total. */
export function abuseSummary(counts: Partial<Record<string, number>>): { total: number; lines: { kind: string; label: string; count: number }[] } {
  const lines = Object.entries(counts)
    .filter((e): e is [string, number] => typeof e[1] === "number" && e[1] > 0)
    .map(([kind, count]) => ({ kind, label: ABUSE_LABEL[kind] ?? kind.replace(/_/g, " "), count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
  return { total: lines.reduce((n, l) => n + l.count, 0), lines };
}

/** Validates the website-call form like the server does, so the form can show the problem before saving. Returns an error per field. */
export function validatePublicForm(v: { dailyMinutes: string; perIp: string; perAgent: string; maxSession: string }, L: { dailyMinutesMax: number; hourlyMax: number; sessionMin: number; sessionMax: number }) {
  const whole = (s: string, min: number, max: number, what: string) => (/^\d+$/.test(s.trim()) && Number(s) >= min && Number(s) <= max ? null : `${what}: enter a whole number from ${min} to ${max}.`);
  return {
    dailyMinutes: whole(v.dailyMinutes, 0, L.dailyMinutesMax, "Minutes per day"),
    perIp: whole(v.perIp, 1, L.hourlyMax, "Calls per visitor"),
    perAgent: whole(v.perAgent, 1, L.hourlyMax, "Calls per agent"),
    maxSession: whole(v.maxSession, L.sessionMin, L.sessionMax, "Longest call"),
  };
}
