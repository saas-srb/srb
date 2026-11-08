import "server-only";
import type { SpeechAgentResult } from "@/lib/dealflow-ai/meeting-agents";
import type { MeetingDoc } from "@/lib/dealflow-ai/meetings/types";
import { staffMayRunAgents } from "@/lib/dealflow-ai/meetings/answer";

/**
 * Handlers for the two audio routes of the live room, with their dependencies injected (so tests need no ElevenLabs, LiveKit or database):
 *  - tts: one sentence of an agent's reply, spoken in that agent's own voice. Staff session + roster check, like the text route.
 *  - stt: one finished utterance of one participant, transcribed with the company's ElevenLabs key. Authenticated by the participant's own
 *    LiveKit token (guests have no account), limited per participant, size and duration capped, idempotent by utterance id.
 */

export const TTS_MAX_CHARS = 600;
export const STT_MAX_BYTES = 1_500_000;
export const STT_MIN_MS = 250;
export const STT_MAX_MS = 30_000;
export const STT_PER_MINUTE = 45;

const json = (status: number, error: string) => Response.json({ ok: false, error }, { status });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ---------------------------------------------------------------------------
// TTS
// ---------------------------------------------------------------------------

export interface TtsDeps {
  staff(): Promise<{ id: string } | null>;
  limit(userId: string): Promise<Response | null>;
  getMeeting(roomId: string): Promise<MeetingDoc | null>;
  agent(roomId: string, agentId: string): Promise<SpeechAgentResult>;
  reserve(roomId: string, chars: number): Promise<{ ok: true } | { ok: false; status: number; error: string }>;
  /** Opens the audio stream (audio/mpeg) for the text in the voice. */
  speak(text: string, voiceId: string): Promise<ReadableStream<Uint8Array>>;
}

/** Text that is spoken aloud: no markup, no control characters. */
export function speakableText(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .replace(/[*_#`>~|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TTS_MAX_CHARS);
}

export async function handleTts(body: unknown, deps: TtsDeps): Promise<Response> {
  const user = await deps.staff();
  if (!user) return json(401, "Sign in as a team member to run the meeting's AI agents.");
  const limited = await deps.limit(user.id);
  if (limited) return limited;
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const roomId = str(b.roomId, 80);
  const agentId = str(b.agentId, 64);
  const text = speakableText(b.text);
  if (!roomId || !agentId || !text) return json(400, "roomId, agentId and text are required");

  const meeting = await deps.getMeeting(roomId);
  if (!meeting) return json(404, "Meeting not found");
  if (!staffMayRunAgents(meeting, user.id)) return json(403, "You are not a team participant of this meeting.");
  const found = await deps.agent(roomId, agentId);
  if (!found.ok) return json(found.status, found.error);
  const reserved = await deps.reserve(roomId, text.length);
  if (!reserved.ok) return json(reserved.status, reserved.error);

  try {
    const audio = await deps.speak(text, found.agent.voiceId);
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[meetings/tts] voice error:", e instanceof Error ? e.message.slice(0, 200) : "error");
    return json(502, "The voice service could not speak this reply");
  }
}

// ---------------------------------------------------------------------------
// STT
// ---------------------------------------------------------------------------

export interface SttDeps {
  /** Verifies the Bearer token; null when invalid or expired. */
  verify(token: string): Promise<{ participantId: string; roomId: string } | null>;
  getMeeting(roomId: string): Promise<MeetingDoc | null>;
  /** Per-participant allowance. */
  limit(key: string): Promise<{ ok: true } | { ok: false; retryAfter: number }>;
  reserve(roomId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }>;
  transcribe(audio: Buffer, mime: string, languageCode: string | null): Promise<{ text: string; languageCode: string | null }>;
}

const ALLOWED_AUDIO = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)(;.*)?$/i;

/** Removes sound-effect tags and filler Scribe or any recogniser may add for non-speech, so silence never becomes a transcript line. */
export function cleanTranscript(raw: string): string {
  const t = raw
    .replace(/\([^)]{0,40}\)|\[[^\]]{0,40}\]/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(t)) return "";
  return t.slice(0, 1500);
}

const done = new Map<string, { at: number; body: { ok: true; text: string; language: string | null } }>();
const DONE_TTL = 3 * 60_000;
const DONE_MAX = 300;

export function clearSttCache(): void {
  done.clear();
}

export async function handleStt(req: Request, deps: SttDeps): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(401, "Not signed in to this meeting.");
  const who = await deps.verify(token);
  if (!who) return json(401, "Your meeting session expired. Rejoin the meeting.");

  const url = new URL(req.url);
  const roomId = str(url.searchParams.get("roomId"), 80);
  if (!roomId || roomId !== who.roomId) return json(403, "This session belongs to another meeting.");
  const utteranceId = str(url.searchParams.get("u"), 80);
  if (!utteranceId) return json(400, "u (utterance id) is required");
  const lang = str(url.searchParams.get("lang"), 3).toLowerCase();

  const mime = (req.headers.get("content-type") ?? "").trim();
  if (!ALLOWED_AUDIO.test(mime)) return json(415, "Unsupported audio type");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > STT_MAX_BYTES) return json(413, "Audio too large");
  const durationMs = Number(url.searchParams.get("ms") ?? "0");
  if (!Number.isFinite(durationMs) || durationMs < STT_MIN_MS) return json(422, "Audio too short");
  if (durationMs > STT_MAX_MS) return json(413, "Audio too long");

  // Retried upload of a finished utterance: answer from memory, no second charge.
  const cacheKey = `${who.participantId}:${utteranceId}`;
  const hit = done.get(cacheKey);
  if (hit && Date.now() - hit.at < DONE_TTL) return Response.json(hit.body);

  const rate = await deps.limit(`${roomId}:${who.participantId}`);
  if (!rate.ok) return Response.json({ ok: false, error: "Too many audio clips. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });

  const meeting = await deps.getMeeting(roomId);
  if (!meeting) return json(404, "Meeting not found");
  if (meeting.status !== "live") return json(409, "The meeting is not live.");

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength === 0) return json(400, "No audio received");
  if (buf.byteLength > STT_MAX_BYTES) return json(413, "Audio too large");

  const reserved = await deps.reserve(roomId);
  if (!reserved.ok) return json(reserved.status, reserved.error);

  try {
    const r = await deps.transcribe(buf, mime, /^[a-z]{2,3}$/.test(lang) ? lang : null);
    const body = { ok: true as const, text: cleanTranscript(r.text), language: r.languageCode };
    done.set(cacheKey, { at: Date.now(), body });
    while (done.size > DONE_MAX) {
      const oldest = done.keys().next().value;
      if (oldest === undefined) break;
      done.delete(oldest);
    }
    return Response.json(body);
  } catch (e) {
    console.error("[meetings/stt] transcription error:", e instanceof Error ? e.message.slice(0, 200) : "error");
    return json(502, "Speech recognition is unavailable right now.");
  }
}
