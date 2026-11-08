import "server-only";
import { getDb } from "@/lib/mongodb";

/**
 * Guards for the guest-reachable speech routes (agent-speak, tts). A meeting room can be reached by anyone holding its link, so every
 * call spends the company's OpenAI / ElevenLabs money: each room gets a per-minute rate and a lifetime budget (calls and spoken characters).
 * Counters are conditional atomic updates, so two simultaneous requests can never both take the last slot.
 */

export const SPEECH_LIMITS = {
  /** Requests a single room may make per minute, per kind. */
  perMinute: 20,
  /** Lifetime budget of one room. */
  llmCalls: 300,
  ttsCalls: 400,
  ttsChars: 60000,
  /** Speech-to-text calls (one per finished utterance of any participant). */
  sttCalls: 6000,
} as const;

export type SpeechKind = "llm" | "tts" | "stt";
export type SpeechReservation = { ok: true } | { ok: false; status: 429 | 402; error: string };

const COLLECTION = "meeting_speech_usage";

interface UsageDoc { _id: string; llmCalls?: number; ttsCalls?: number; ttsChars?: number; sttCalls?: number; expireAt?: Date }

const isDuplicate = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;

/** Takes one slot in `filter`'s counters atomically; false when the cap is already reached. */
async function take(id: string, caps: Record<string, number>, inc: Record<string, number>, expireAt?: Date): Promise<boolean> {
  const col = (await getDb()).collection<UsageDoc>(COLLECTION);
  // A missing counter field counts as 0: `$not: {$gt: cap - inc}` is true for absent fields too.
  const filter: Record<string, unknown> = { _id: id };
  for (const [field, cap] of Object.entries(caps)) filter[field] = { $not: { $gt: cap - (inc[field] ?? 1) } };
  try {
    await col.updateOne(filter as never, { $inc: inc, ...(expireAt ? { $setOnInsert: { expireAt } } : {}) }, { upsert: true }).then((r) => {
      if (r.matchedCount === 0 && r.upsertedCount === 0) throw new Error("full");
    });
    return true;
  } catch (e) {
    if (isDuplicate(e) || (e instanceof Error && e.message === "full")) return false; // the document exists but the cap is reached
    throw e;
  }
}

/** Reserves one speech request for a room; call before doing any paid work. Pass `chars` for TTS. */
export async function reserveSpeech(roomId: string, kind: SpeechKind, chars = 0, now = Date.now()): Promise<SpeechReservation> {
  const slot = Math.floor(now / 60000);
  // Speech-to-text is one call per spoken sentence of every participant, so its per-minute allowance is larger.
  const perMinute = kind === "stt" ? SPEECH_LIMITS.perMinute * 8 : SPEECH_LIMITS.perMinute;
  const rate = await take(`${roomId}:${kind}:${slot}`, { n: perMinute }, { n: 1 }, new Date((slot + 3) * 60000));
  if (!rate) return { ok: false, status: 429, error: "This room is asking for speech too quickly. Wait a moment." };
  const budget =
    kind === "llm"
      ? await take(`${roomId}:budget`, { llmCalls: SPEECH_LIMITS.llmCalls }, { llmCalls: 1 })
      : kind === "stt"
        ? await take(`${roomId}:budget`, { sttCalls: SPEECH_LIMITS.sttCalls }, { sttCalls: 1 })
        : await take(`${roomId}:budget`, { ttsCalls: SPEECH_LIMITS.ttsCalls, ttsChars: SPEECH_LIMITS.ttsChars }, { ttsCalls: 1, ttsChars: Math.max(1, chars) });
  if (!budget) return { ok: false, status: 402, error: "This meeting has used up its AI speech allowance." };
  return { ok: true };
}

/** Plain, short, single-purpose text for use inside a prompt's data section: control characters and angle brackets removed, length capped. */
export function cleanPromptText(v: unknown, max: number, opts: { multiline?: boolean } = {}): string {
  if (typeof v !== "string") return "";
  let s = v.normalize("NFKC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "").replace(/[<>]/g, "");
  s = opts.multiline ? s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return s.trim().slice(0, max);
}
