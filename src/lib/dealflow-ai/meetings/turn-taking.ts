/**
 * Turn-taking for the AI agents in a meeting. Pure and clock-free (every call gets `now`), so the same code runs in the runner's browser and in
 * the tests. One agent speaks at a time; an agent starts only after the humans have been quiet for a short gap; a human starting to talk
 * stops the agent (when the host allows barge-in) and drops everything queued; agents never answer each other; the same utterance is
 * never handled twice, even across a runner fail-over (the keys are shared over the room's data channel).
 */
import type { ParticipantKind } from "@/lib/dealflow-ai/meetings/types";

export interface TurnJob {
  /** The utterance id (idempotent across retries and runner fail-over). */
  utteranceId: string;
  /** Addressed agents in the order they were named in the sentence. */
  agentIds: string[];
  text: string;
  speakerId: string;
  speakerKind: ParticipantKind;
  at: number;
}

export interface TurnEntry {
  key: string;
  utteranceId: string;
  agentId: string;
  /** 0 for the first agent named; later ones only add what is new. */
  order: number;
  /** Agents that answer the same line before this one (empty for the first). */
  after: string[];
  text: string;
  speakerId: string;
  queuedAt: number;
}

export interface TurnOptions {
  allowBargeIn: boolean;
  /** Humans must have been silent this long before an agent starts. */
  silenceGapMs: number;
  /** A queued answer older than this is dropped (the conversation moved on). */
  staleMs: number;
  maxQueue: number;
  maxSeen: number;
}

export const DEFAULT_TURN_OPTIONS: TurnOptions = { allowBargeIn: true, silenceGapMs: 600, staleMs: 25_000, maxQueue: 8, maxSeen: 600 };

export type EnqueueResult = { ok: true; queued: string[] } | { ok: false; reason: string };

export type TurnAction = { type: "speak"; entry: TurnEntry } | { type: "barge-in"; stopped: TurnEntry | null; dropped: number } | null;

export class TurnManager {
  private queue: TurnEntry[] = [];
  private current: TurnEntry | null = null;
  private humanSpeaking = false;
  private lastHumanAt = Number.NEGATIVE_INFINITY;
  private seen = new Set<string>();
  private readonly opts: TurnOptions;

  constructor(opts: Partial<TurnOptions> = {}) {
    this.opts = { ...DEFAULT_TURN_OPTIONS, ...opts };
  }

  setBargeIn(allow: boolean): void {
    this.opts.allowBargeIn = allow;
  }

  /** Another runner (or an earlier life of this one) already took this line for this agent. */
  markHandled(utteranceId: string, agentId: string): void {
    this.remember(`${utteranceId}:${agentId}`);
    this.queue = this.queue.filter((e) => e.key !== `${utteranceId}:${agentId}`);
  }

  isHandled(utteranceId: string, agentId: string): boolean {
    return this.seen.has(`${utteranceId}:${agentId}`);
  }

  private remember(key: string): void {
    this.seen.delete(key);
    this.seen.add(key);
    while (this.seen.size > this.opts.maxSeen) {
      const oldest = this.seen.values().next().value;
      if (oldest === undefined) break;
      this.seen.delete(oldest);
    }
  }

  /** Adds the agents a line addressed. Agent speech is refused, so agents never answer each other. */
  enqueue(job: TurnJob): EnqueueResult {
    if (job.speakerKind === "agent") return { ok: false, reason: "agents do not answer agents" };
    const ids = [...new Set(job.agentIds)];
    if (!ids.length) return { ok: false, reason: "no agent addressed" };
    const fresh = ids.filter((id) => !this.seen.has(`${job.utteranceId}:${id}`));
    if (!fresh.length) return { ok: false, reason: "already handled" };
    const queued: string[] = [];
    fresh.forEach((agentId) => {
      const order = ids.indexOf(agentId);
      const entry: TurnEntry = { key: `${job.utteranceId}:${agentId}`, utteranceId: job.utteranceId, agentId, order, after: ids.slice(0, order), text: job.text, speakerId: job.speakerId, queuedAt: job.at };
      if (this.queue.length >= this.opts.maxQueue) return;
      this.remember(entry.key);
      this.queue.push(entry);
      queued.push(agentId);
    });
    this.queue.sort((a, b) => a.queuedAt - b.queuedAt || a.order - b.order);
    return queued.length ? { ok: true, queued } : { ok: false, reason: "queue full" };
  }

  /** Feed human voice activity (local VAD and remote active speakers). Returns a barge-in action when the agent must stop. */
  humanActivity(speaking: boolean, now: number): TurnAction {
    this.humanSpeaking = speaking;
    // Both edges count: the quiet gap is measured from the moment the person stopped.
    this.lastHumanAt = now;
    if (!speaking) return null;
    // Only an agent that is actually talking is cut off. An answer still waiting just waits for the gap to be quiet again.
    if (!this.opts.allowBargeIn || !this.current) return null;
    const stopped = this.current;
    const dropped = this.queue.length;
    this.current = null;
    this.queue = [];
    return { type: "barge-in", stopped, dropped };
  }

  /** The next answer to start, if it is allowed to start now. */
  next(now: number): TurnAction {
    this.queue = this.queue.filter((e) => now - e.queuedAt <= this.opts.staleMs);
    if (this.current || !this.queue.length) return null;
    if (this.humanSpeaking || now - this.lastHumanAt < this.opts.silenceGapMs) return null;
    const entry = this.queue.shift()!;
    this.current = entry;
    return { type: "speak", entry };
  }

  /** The current answer ended (finished, failed or was cut). */
  finish(key: string): void {
    if (this.current?.key === key) this.current = null;
  }

  get speaking(): TurnEntry | null {
    return this.current;
  }

  get pending(): readonly TurnEntry[] {
    return this.queue;
  }

  /** Forget everything queued (the runner lost its role or the agent was muted). Handled keys are kept. */
  clear(agentId?: string): void {
    if (!agentId) {
      this.queue = [];
      this.current = null;
      return;
    }
    this.queue = this.queue.filter((e) => e.agentId !== agentId);
    if (this.current?.agentId === agentId) this.current = null;
  }
}

// ---------------------------------------------------------------------------
// Answer length cap
// ---------------------------------------------------------------------------

/** Splits spoken text into sentences, keeping the punctuation (handles the Hindi danda and common abbreviations). */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const out: string[] = [];
  let buf = "";
  const abbr = /\b(?:mr|mrs|ms|dr|prof|sr|jr|vs|etc|no|st|inc|ltd|approx|e\.g|i\.e)\.$/i;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    buf += c;
    if (/[.!?।]/.test(c)) {
      const next = clean[i + 1];
      // end of a sentence: punctuation followed by space/end, not an abbreviation, not a decimal like 2.5
      if ((next === undefined || next === " ") && !abbr.test(buf.trim()) && !/\d\.$/.test(buf) ) {
        out.push(buf.trim());
        buf = "";
      } else if (next === undefined) {
        out.push(buf.trim());
        buf = "";
      }
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Rough speaking time in seconds (about 2.5 words a second; Devanagari and Latin alike). */
export function estimateSpeechSecs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words / 2.5;
}

export interface CappedAnswer {
  sentences: string[];
  truncated: boolean;
  /** What was left out (for "continue"). */
  rest: string[];
}

/**
 * Keeps whole sentences until the spoken-time budget is used up. The first sentence is always kept. When something is cut the caller adds a short
 * offer to continue (`CONTINUE_OFFER`) so the answer ends politely instead of mid-sentence.
 */
export function capAnswer(sentences: string[], maxSecs: number): CappedAnswer {
  const kept: string[] = [];
  let used = 0;
  for (let i = 0; i < sentences.length; i++) {
    const t = estimateSpeechSecs(sentences[i]);
    if (kept.length && used + t > maxSecs) return { sentences: kept, truncated: true, rest: sentences.slice(i) };
    kept.push(sentences[i]);
    used += t;
  }
  return { sentences: kept, truncated: false, rest: [] };
}

export const CONTINUE_OFFER = "Shall I continue?";
