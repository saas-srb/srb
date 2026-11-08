import "server-only";
import { eventsCollection, recordCallEvent } from "@/lib/products/agentos/calls/live";
import { conferenceCollection, getConference, humanIntervals, modeAt, type ConferenceDoc } from "@/lib/products/agentos/calls/conference-state";
import { callsCollection } from "@/lib/products/agentos/calls/store";
import type { CallDoc, CallEventDoc } from "@/lib/products/agentos/calls/types";

/**
 * The transcript of a conference call has two sources: Twilio's real-time transcription of the lead's leg (heard live, labelled lead / AI /
 * human) and ElevenLabs' own transcript of the AI's side (complete once the call ends, but it knows nothing of what a team member said, and it
 * hears only silence while the AI is held). The final transcript keeps ElevenLabs' lines outside the stretches a team member was in control and
 * Twilio's lines (lead and team member) inside them.
 */

export type TranscriptLine = NonNullable<CallDoc["transcript"]>[number];

export const SPOKEN_MAX = 1000;
/** Plain one-line text from a speech engine: control characters out, whitespace collapsed, bounded. Rendered as text, never as markup. */
export function cleanSpoken(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.normalize("NFKC").replace(/[\p{C}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, SPOKEN_MAX);
}

export interface TwilioTranscriptionLine {
  callSid: string;
  track: "inbound_track" | "outbound_track";
  sequenceId: string;
  final: boolean;
  transcript: string;
  timestamp: Date | null;
}

/** Reads the form fields of a Twilio transcription callback. Null for anything that isn't a line of speech. */
export function parseTranscriptionCallback(p: URLSearchParams): TwilioTranscriptionLine | null {
  if (p.get("TranscriptionEvent") !== "transcription-content") return null;
  const data = p.get("TranscriptionData");
  if (!data || data.length > 20_000) return null;
  let text = "";
  try {
    text = cleanSpoken((JSON.parse(data) as { transcript?: unknown }).transcript);
  } catch {
    return null;
  }
  const callSid = p.get("CallSid") ?? "";
  const track = p.get("Track") ?? "";
  const sequenceId = p.get("SequenceId") ?? "";
  if (!text || !/^CA[0-9a-f]{32}$/i.test(callSid) || (track !== "inbound_track" && track !== "outbound_track") || !/^\d{1,9}$/.test(sequenceId)) return null;
  const ts = new Date(p.get("Timestamp") ?? "");
  return { callSid, track, sequenceId, final: p.get("Final") === "true", transcript: text, timestamp: Number.isNaN(ts.getTime()) ? null : ts };
}

/**
 * Stores one final line. The lead's leg hears the lead on the inbound track; what the lead hears (outbound track) is the AI or, while a team
 * member is in control, that person. A replay carries the same key and is ignored.
 */
export async function recordTwilioLine(call: CallDoc, line: TwilioTranscriptionLine): Promise<boolean> {
  if (!line.final) return false;
  const at = line.timestamp ?? new Date();
  const type: CallEventDoc["type"] = line.track === "inbound_track" ? "user" : modeAt(call.control.history ?? [], at) === "human" ? "human" : "agent";
  return recordCallEvent(call._id, { type, text: line.transcript, key: `tw:${line.callSid}:${line.track}:${line.sequenceId}`, by: type === "human" ? call.control.handler : null, at });
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export interface MergeInput {
  eleven: TranscriptLine[] | null;
  /** Twilio lines, any order: type user = lead, agent = AI, human = team member. */
  events: { at: Date; type: "user" | "agent" | "human"; text: string }[];
  history: { at: Date; to: "ai" | "human" }[];
  /** When ElevenLabs' clock started (the AI joined the conference). */
  aiJoinedAt: Date | null;
  answeredAt: Date | null;
  endedAt: Date | null;
}

/** Pure. See the module comment for the rule. Output is ordered by time and every line has a speaker. */
export function mergeTranscripts(i: MergeInput): TranscriptLine[] {
  const zero = (i.aiJoinedAt ?? i.answeredAt ?? i.events[0]?.at ?? new Date(0)).getTime();
  const spans = humanIntervals(i.history, i.endedAt ?? new Date(8.64e15));
  const inHuman = (ms: number) => spans.some((s) => ms >= s.from.getTime() && ms <= s.to.getTime());
  const secs = (ms: number) => Math.max(0, Math.round((ms - zero) / 100) / 10);
  type Timed = { ms: number; order: number; line: TranscriptLine };
  const out: Timed[] = [];
  let n = 0;
  if (i.eleven?.length) {
    let last = zero;
    for (const t of i.eleven) {
      const ms = t.atSecs !== null && i.aiJoinedAt ? zero + t.atSecs * 1000 : last;
      last = ms;
      if (inHuman(ms)) continue; // the AI was held: nothing it "heard" or "said" then reached the lead
      out.push({ ms, order: n++, line: { role: t.role, text: t.text, atSecs: t.atSecs, speaker: t.role === "user" ? "lead" : "ai" } });
    }
  }
  const haveEleven = out.length > 0;
  for (const e of [...i.events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const ms = e.at.getTime();
    if (e.type === "human") out.push({ ms, order: n++, line: { role: "agent", text: e.text, atSecs: secs(ms), speaker: "human" } });
    else if (e.type === "user" && (inHuman(ms) || !haveEleven)) out.push({ ms, order: n++, line: { role: "user", text: e.text, atSecs: secs(ms), speaker: "lead" } });
    else if (e.type === "agent" && !haveEleven) out.push({ ms, order: n++, line: { role: "agent", text: e.text, atSecs: secs(ms), speaker: "ai" } });
  }
  return out.sort((a, b) => a.ms - b.ms || a.order - b.order).map((x) => x.line).slice(0, 1000);
}

async function mergeInput(call: CallDoc, conf: ConferenceDoc, eleven: TranscriptLine[] | null): Promise<MergeInput> {
  const rows = await (await eventsCollection()).find({ callId: call._id, type: { $in: ["user", "agent", "human"] } }).sort({ seq: 1 }).limit(2000).toArray();
  return {
    eleven, events: rows.map((r) => ({ at: r.at, type: r.type as "user" | "agent" | "human", text: r.text })),
    history: (call.control.history ?? []).map((h) => ({ at: h.at, to: h.to })), aiJoinedAt: conf.aiJoinedAt, answeredAt: conf.answeredAt, endedAt: conf.leadEndedAt ?? conf.endedAt,
  };
}

/** Used by the engine when ElevenLabs' transcript arrives: unchanged for ordinary calls, merged for conference calls. */
export async function mergeConferenceTranscript(call: CallDoc, eleven: TranscriptLine[]): Promise<TranscriptLine[]> {
  const conf = await getConference(call._id);
  if (!conf) return eleven;
  return mergeTranscripts(await mergeInput(call, conf, eleven));
}

/** The transcript from Twilio's lines alone, for a call whose ElevenLabs result never arrived. Null when nothing was said. */
export async function twilioOnlyTranscript(call: CallDoc): Promise<TranscriptLine[] | null> {
  const conf = await getConference(call._id);
  if (!conf) return null;
  const merged = mergeTranscripts(await mergeInput(call, conf, null));
  return merged.length ? merged : null;
}

/**
 * Ties the ElevenLabs conversation of an AI leg to its call. register-call answers with TwiML only (no conversation id), so the link is made
 * when the post-call result names the Twilio call SID of the AI leg (`system__call_sid`). Both the agent and the SID must match what we created.
 */
export async function linkConferenceConversation(data: { agent_id?: string; conversation_id?: string; conversation_initiation_client_data?: { dynamic_variables?: Record<string, unknown> } }): Promise<string | null> {
  const sid = data.conversation_initiation_client_data?.dynamic_variables?.system__call_sid;
  if (typeof sid !== "string" || !/^CA[0-9a-f]{32}$/i.test(sid) || typeof data.conversation_id !== "string" || !data.conversation_id || !data.agent_id) return null;
  const conf = await (await conferenceCollection()).findOne({ aiSid: sid });
  if (!conf || conf.elevenAgentId !== data.agent_id) return null;
  const calls = await callsCollection();
  const call = await calls.findOne({ _id: conf._id });
  if (!call) return null;
  if (call.conversationId === data.conversation_id) return call._id;
  if (call.conversationId) return null;
  try {
    const r = await calls.updateOne({ _id: call._id, conversationId: null }, { $set: { conversationId: data.conversation_id, updatedAt: new Date() } });
    return r.modifiedCount === 1 ? call._id : null;
  } catch {
    return null; // unique index: that conversation already belongs to another call
  }
}
