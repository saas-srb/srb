import "server-only";
import { getDb } from "@/lib/mongodb";
import { CALL_COLLECTIONS, type CallDoc } from "@/lib/products/agentos/calls/types";

/**
 * Conference calls: the phone legs of one call (lead, AI, a team member's browser) and what Twilio last told us about each.
 * One document per call, `_id` = the call id. The CALL row stays the source of truth for who is in control (`control`); this document only
 * knows the phone plumbing. Tenant scoping comes from the data layer like every other AgentOS collection.
 */

export interface ConferenceDoc {
  _id: string;
  /** The Twilio conference's friendly name: random and unguessable, only ever sent to Twilio and used in our own TwiML. */
  name: string;
  conferenceSid: string | null;
  leadSid: string | null;
  aiSid: string | null;
  humanSid: string | null;
  humanUserId: string | null;
  leadState: "dialing" | "joined" | "left" | "failed";
  aiState: "none" | "adding" | "joined" | "left" | "failed";
  humanState: "none" | "joined" | "left";
  /** Set once the AI leg's TwiML asked ElevenLabs to register the call: a second request for the same leg never registers twice. */
  aiRegisteredAt: Date | null;
  elevenAgentId: string;
  /** The company number the lead was dialed from (E.164). */
  fromNumber: string;
  /** BCP-47 code for Twilio's transcription of this call. */
  transcriptionLanguage: string;
  /** What the AI says first (AI disclosure + its greeting), sent with register-call; null = the agent's own greeting. */
  opening?: string | null;
  /** The call briefing text, only until the AI leg registers with ElevenLabs (then removed). Never kept after the conference. */
  briefing?: string;
  answeredAt: Date | null;
  aiJoinedAt: Date | null;
  leadEndedAt: Date | null;
  endedAt: Date | null;
  twilioDurationSecs: number | null;
  /** Nobody is handling the call (AI gone, no team member): the sweep ends it after a grace period. */
  unattendedSince: Date | null;
  /** Bounded list of processed callback keys: a replayed callback changes nothing. */
  seen: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const SEEN_LIMIT = 300;

let indexed = false;
export async function conferenceCollection() {
  const col = (await getDb()).collection<ConferenceDoc>(CALL_COLLECTIONS.conferences);
  if (!indexed) {
    indexed = true;
    await Promise.all([
      col.createIndex({ leadSid: 1 }, { sparse: true }).catch(() => {}),
      col.createIndex({ aiSid: 1 }, { sparse: true }).catch(() => {}),
      col.createIndex({ endedAt: 1, leadEndedAt: 1 }).catch(() => {}),
    ]);
  }
  return col;
}
export function resetConferenceIndexes(): void {
  indexed = false;
}

export async function getConference(callId: string): Promise<ConferenceDoc | null> {
  return (await conferenceCollection()).findOne({ _id: callId });
}

/** First time this key is seen -> true and remembered; a replay -> false. Atomic. */
export async function firstTime(callId: string, key: string): Promise<boolean> {
  const r = await (await conferenceCollection()).updateOne({ _id: callId, seen: { $ne: key } }, { $push: { seen: { $each: [key], $slice: -SEEN_LIMIT } }, $set: { updatedAt: new Date() } });
  return r.modifiedCount === 1;
}

/** Who held the call at `at`, from the control history (oldest first). Pure. */
export function modeAt(history: { at: Date; to: "ai" | "human" }[], at: Date): "ai" | "human" {
  let mode: "ai" | "human" = "ai";
  for (const h of history) {
    if (h.at.getTime() <= at.getTime()) mode = h.to;
    else break;
  }
  return mode;
}

/** The stretches of the call a team member was in control. Open-ended stretches run to `until`. Pure. */
export function humanIntervals(history: { at: Date; to: "ai" | "human" }[], until: Date): { from: Date; to: Date }[] {
  const out: { from: Date; to: Date }[] = [];
  let start: Date | null = null;
  for (const h of history) {
    if (h.to === "human" && !start) start = h.at;
    if (h.to === "ai" && start) {
      out.push({ from: start, to: h.at });
      start = null;
    }
  }
  if (start) out.push({ from: start, to: until });
  return out;
}

export const LIVE_CALL_STATUSES: readonly CallDoc["status"][] = ["dialing", "in_progress"];

export interface ConferenceView {
  /** connecting: the lead has not picked up yet. live: talking. ended: the lead hung up or the call ended (results may still be coming). */
  phase: "connecting" | "live" | "ended";
  lead: ConferenceDoc["leadState"];
  ai: ConferenceDoc["aiState"];
  human: ConferenceDoc["humanState"];
  /** Ready to take over: you are in the call as a listener. */
  youAreListening: boolean;
  answeredAt: string | null;
}

export function toConferenceView(c: ConferenceDoc, viewerId: string): ConferenceView {
  const ended = Boolean(c.endedAt || c.leadEndedAt || c.leadState === "left" || c.leadState === "failed");
  return {
    phase: ended ? "ended" : c.leadState === "joined" ? "live" : "connecting",
    lead: c.leadState, ai: c.aiState, human: c.humanState,
    youAreListening: c.humanState === "joined" && c.humanUserId === viewerId,
    answeredAt: c.answeredAt?.toISOString() ?? null,
  };
}
