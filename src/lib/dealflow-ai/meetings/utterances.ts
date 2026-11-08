import "server-only";
import { getDb } from "@/lib/mongodb";
import { getMeeting, type MeetingRoom } from "@/lib/dealflow-ai/db-meetings";
import { getLiveKitCredentials, verifyRoomToken, type LiveKitCredentials, type VerifiedRoomToken } from "@/lib/dealflow-ai/meetings/livekit";
import type { MeetingUtterance, ParticipantKind } from "@/lib/dealflow-ai/meetings/types";

/**
 * The meeting transcript: one row per finalized spoken line in `dealflow_meeting_utterances`, unique per (roomId, utteranceId), so the same line
 * sent twice (a retry, or every browser publishing it) is stored once. The speaker's name and kind come from the roster, never from the request.
 */

export const UTTERANCES_COLLECTION = "dealflow_meeting_utterances";
export const UTTERANCE_LIMITS = { textMax: 2000, idMax: 80, perMeeting: 20_000, listMax: 5000 } as const;

export interface UtteranceRow {
  roomId: string;
  utteranceId: string;
  at: number;
  speakerId: string;
  speakerName: string;
  speakerKind: ParticipantKind;
  text: string;
  addressedTo: string[];
  createdAt: Date;
}

let indexed = false;
export function resetUtteranceIndexes(): void {
  indexed = false;
}
async function col() {
  const c = (await getDb()).collection<UtteranceRow>(UTTERANCES_COLLECTION);
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ roomId: 1, utteranceId: 1 }, { unique: true }), c.createIndex({ roomId: 1, at: 1 })]).catch(() => {});
  }
  return c;
}

export interface AppendInput {
  roomId: string;
  utteranceId: string;
  at: number;
  speakerId: string;
  speakerName: string;
  speakerKind: ParticipantKind;
  text: string;
  addressedTo?: string[];
}

export type AppendResult = { ok: true; stored: boolean } | { ok: false; error: string };

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "");

/** Idempotent and size-capped. `stored: false` means the line was already there. */
export async function appendUtterance(i: AppendInput): Promise<AppendResult> {
  const text = clean(i.text, UTTERANCE_LIMITS.textMax);
  const utteranceId = clean(i.utteranceId, UTTERANCE_LIMITS.idMax);
  if (!text) return { ok: false, error: "Empty line" };
  if (!utteranceId) return { ok: false, error: "A line needs an id" };
  const c = await col();
  // Counting first keeps one runaway client from filling the database; a retry of an existing line is still accepted below.
  const exists = await c.findOne({ roomId: i.roomId, utteranceId }, { projection: { _id: 1 } });
  if (exists) return { ok: true, stored: false };
  if ((await c.countDocuments({ roomId: i.roomId }, { limit: UTTERANCE_LIMITS.perMeeting })) >= UTTERANCE_LIMITS.perMeeting) return { ok: false, error: "Transcript limit reached" };
  const at = Number.isFinite(i.at) ? Math.round(i.at) : Date.now();
  const res = await c.updateOne(
    { roomId: i.roomId, utteranceId },
    { $setOnInsert: { roomId: i.roomId, utteranceId, at, speakerId: i.speakerId, speakerName: i.speakerName, speakerKind: i.speakerKind, text, addressedTo: (i.addressedTo ?? []).slice(0, 10).map((a) => clean(a, 80)).filter(Boolean), createdAt: new Date() } },
    { upsert: true },
  );
  return { ok: true, stored: res.upsertedCount === 1 };
}

export async function listUtterances(roomId: string, opts: { limit?: number } = {}): Promise<MeetingUtterance[]> {
  const rows = await (await col()).find({ roomId }).sort({ at: 1, utteranceId: 1 }).limit(Math.min(opts.limit ?? UTTERANCE_LIMITS.listMax, UTTERANCE_LIMITS.listMax)).toArray();
  return rows.map((r) => ({ id: r.utteranceId, at: r.at, speakerId: r.speakerId, speakerName: r.speakerName, speakerKind: r.speakerKind, text: r.text, ...(r.addressedTo.length ? { addressedTo: r.addressedTo } : {}), final: true }));
}

/** "Name: text" per line, in order. */
export function assembleTranscript(lines: Pick<MeetingUtterance, "speakerName" | "text">[]): string {
  return lines.map((l) => `${l.speakerName}: ${l.text}`).join("\n");
}

export interface AcceptDeps {
  credentials?: () => Promise<LiveKitCredentials | null>;
  verify?: (creds: LiveKitCredentials, token: string) => Promise<VerifiedRoomToken | null>;
  meeting?: (roomId: string) => Promise<MeetingRoom | null>;
  now?: () => number;
}

export type AcceptResult = { ok: true; stored: boolean } | { ok: false; status: number; error: string };

/**
 * What the route behind `POST /api/dealflow-ai/meetings/[roomId]/utterances` does. The bearer is the LiveKit token the server issued for this
 * person (signature, expiry and room are checked). A line is stored as that person; only the elected agent runner (a staff token) may store a
 * line as one of the meeting's AI agents. Lines are accepted while the meeting is live, and for a short while after it ends (last words).
 */
export async function acceptUtterance(roomId: string, bearer: string | null, body: unknown, deps: AcceptDeps = {}): Promise<AcceptResult> {
  if (!bearer) return { ok: false, status: 401, error: "Sign-in required" };
  const creds = await (deps.credentials ?? getLiveKitCredentials)();
  if (!creds) return { ok: false, status: 503, error: "Video calling isn't set up" };
  const who = await (deps.verify ?? verifyRoomToken)(creds, bearer);
  if (!who || who.roomId !== roomId) return { ok: false, status: 401, error: "Invalid token" };
  const m = await (deps.meeting ?? getMeeting)(roomId);
  if (!m) return { ok: false, status: 404, error: "Meeting not found" };
  const now = (deps.now ?? Date.now)();
  const endedAgo = m.endedAt ? now - new Date(m.endedAt).getTime() : 0;
  if (m.status === "cancelled" || m.status === "scheduled" || (m.status === "ended" && endedAgo > 5 * 60_000)) return { ok: false, status: 409, error: "This meeting is not accepting lines" };
  const me = m.participants.find((p) => p.id === who.participantId);
  if (!me || me.kind === "agent") return { ok: false, status: 403, error: "You are not in this meeting" };
  if (typeof body !== "object" || body === null) return { ok: false, status: 400, error: "Invalid request" };
  const b = body as Record<string, unknown>;
  const speakerId = typeof b.speakerId === "string" && b.speakerId ? b.speakerId : me.id;
  const speaker = m.participants.find((p) => p.id === speakerId);
  if (!speaker) return { ok: false, status: 403, error: "Unknown speaker" };
  if (speaker.id !== me.id && !(speaker.kind === "agent" && me.kind === "internal" && who.runner)) return { ok: false, status: 403, error: "You can only add your own lines" };
  const res = await appendUtterance({
    roomId, utteranceId: String(b.id ?? b.utteranceId ?? ""), at: typeof b.at === "number" ? b.at : now, speakerId: speaker.id, speakerName: speaker.name, speakerKind: speaker.kind,
    text: String(b.text ?? ""), addressedTo: Array.isArray(b.addressedTo) ? b.addressedTo.filter((x): x is string => typeof x === "string") : [],
  });
  return res.ok ? { ok: true, stored: res.stored } : { ok: false, status: 400, error: res.error };
}
