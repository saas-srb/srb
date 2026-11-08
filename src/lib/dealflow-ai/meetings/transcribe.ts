/**
 * Speech capture for one participant: resampling, voice-activity segmentation, WAV encoding, echo filtering and the upload queue.
 * Pure TypeScript with no browser globals (the Web Audio plumbing lives in the room component), so it is unit-tested with synthetic audio.
 *
 * Why WAV from PCM instead of MediaRecorder: the segmenter needs a pre-roll (the first syllable is spoken before the detector is sure it is speech)
 * and exact cut points, which compressed recorder chunks cannot give. 16 kHz mono 16-bit is 32 KB/s, so a 20 s clip stays under the route's cap.
 */

export const STT_SAMPLE_RATE = 16000;
export const FRAME_MS = 20;
export const FRAME_SAMPLES = (STT_SAMPLE_RATE * FRAME_MS) / 1000; // 320

// ---------------------------------------------------------------------------
// Resampling
// ---------------------------------------------------------------------------

/** Streaming down-sampler (box average between output points, which doubles as a cheap low-pass). Input of any chunk size. */
export class Resampler {
  private acc = 0;
  private count = 0;
  private pos = 0; // fractional input position consumed toward the next output sample
  private readonly step: number;
  constructor(inputRate: number, outputRate = STT_SAMPLE_RATE) {
    if (!(inputRate > 0) || !(outputRate > 0)) throw new Error("invalid sample rate");
    this.step = inputRate / outputRate;
  }

  push(input: Float32Array): Float32Array {
    const out: number[] = [];
    for (let i = 0; i < input.length; i++) {
      this.acc += input[i];
      this.count++;
      this.pos += 1;
      if (this.pos >= this.step) {
        out.push(this.acc / this.count);
        this.acc = 0;
        this.count = 0;
        this.pos -= this.step;
      }
    }
    return Float32Array.from(out);
  }
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate = STT_SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

export function rms(frame: Float32Array): number {
  if (!frame.length) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

// ---------------------------------------------------------------------------
// Voice activity segmentation
// ---------------------------------------------------------------------------

export interface VadOptions {
  /** Voiced time needed before a segment counts as speech (filters clicks and coughs). */
  minSpeechMs: number;
  /** Silence that ends a segment. */
  hangoverMs: number;
  /** A segment is cut here even if the person keeps talking. */
  maxSegmentMs: number;
  /** Audio kept from before the detector fired. */
  prerollMs: number;
  /** Silence kept at the end of a clip. */
  tailMs: number;
  /** Lowest RMS ever treated as speech. */
  minLevel: number;
  /** Speech must exceed the noise floor by this factor. */
  ratio: number;
  /** While an agent's voice plays locally, the threshold is multiplied by this (echo that survives cancellation is quieter than a person at the mic). */
  playbackBoost: number;
}

export const VAD_DEFAULTS: VadOptions = { minSpeechMs: 260, hangoverMs: 700, maxSegmentMs: 20_000, prerollMs: 320, tailMs: 240, minLevel: 0.012, ratio: 3, playbackBoost: 2.6 };

export type VadEvent =
  /** Speech is confirmed (after minSpeechMs): used to stop an agent that is talking. */
  | { type: "start"; at: number }
  /** A finished clip. `startedAt` is the clock time of its first sample. `playbackOverlap` is the share of voiced frames heard while an agent was audible. */
  | { type: "end"; startedAt: number; endedAt: number; audio: Float32Array; durationMs: number; playbackOverlap: number; forced: boolean };

export class VadSegmenter {
  private readonly o: VadOptions;
  private floor = 0.004;
  private ring: Float32Array[] = [];
  private seg: Float32Array[] = [];
  private inSpeech = false;
  private confirmed = false;
  private voicedMs = 0;
  private silenceMs = 0;
  private segStart = 0;
  private overlapFrames = 0;
  private voicedFrames = 0;

  constructor(opts: Partial<VadOptions> = {}) {
    this.o = { ...VAD_DEFAULTS, ...opts };
  }

  get active(): boolean {
    return this.inSpeech && this.confirmed;
  }

  /** Feed one 20 ms frame (320 samples at 16 kHz). `now` is the frame's clock time in ms. */
  push(frame: Float32Array, now: number, playbackActive: boolean): VadEvent[] {
    const events: VadEvent[] = [];
    const level = rms(frame);
    const threshold = Math.max(this.o.minLevel, this.floor * this.o.ratio) * (playbackActive ? this.o.playbackBoost : 1);
    const voiced = level > threshold;
    const prerollFrames = Math.ceil(this.o.prerollMs / FRAME_MS);

    if (!this.inSpeech) {
      // The noise floor follows quiet audio only, so speech never raises its own threshold.
      if (!voiced) this.floor = Math.min(0.05, Math.max(0.002, this.floor * 0.95 + level * 0.05));
      this.ring.push(frame);
      if (this.ring.length > prerollFrames) this.ring.shift();
      if (voiced) {
        this.inSpeech = true;
        this.confirmed = false;
        this.voicedMs = FRAME_MS;
        this.silenceMs = 0;
        this.overlapFrames = playbackActive ? 1 : 0;
        this.voicedFrames = 1;
        this.seg = [...this.ring];
        this.segStart = now - (this.seg.length - 1) * FRAME_MS;
        this.ring = [];
      }
      return events;
    }

    this.seg.push(frame);
    if (voiced) {
      this.voicedMs += FRAME_MS;
      this.silenceMs = 0;
      this.voicedFrames++;
      if (playbackActive) this.overlapFrames++;
      if (!this.confirmed && this.voicedMs >= this.o.minSpeechMs) {
        this.confirmed = true;
        events.push({ type: "start", at: now });
      }
    } else {
      this.silenceMs += FRAME_MS;
    }

    const lengthMs = this.seg.length * FRAME_MS;
    const ended = this.silenceMs >= this.o.hangoverMs;
    const tooLong = lengthMs >= this.o.maxSegmentMs;
    if (ended || tooLong) {
      if (this.confirmed) events.push(this.finish(now, tooLong && !ended));
      this.reset();
    }
    return events;
  }

  /** Flush at the end of the stream (mic closed): a clip in progress is delivered. */
  flush(now: number): VadEvent[] {
    if (!this.inSpeech || !this.confirmed) {
      this.reset();
      return [];
    }
    const e = this.finish(now, false);
    this.reset();
    return [e];
  }

  private finish(now: number, forced: boolean): VadEvent {
    // Trim the trailing silence down to tailMs.
    const extra = Math.max(0, Math.floor((this.silenceMs - this.o.tailMs) / FRAME_MS));
    const frames = extra ? this.seg.slice(0, this.seg.length - extra) : this.seg;
    const audio = new Float32Array(frames.length * FRAME_SAMPLES);
    frames.forEach((f, i) => audio.set(f.length === FRAME_SAMPLES ? f : f.subarray(0, FRAME_SAMPLES), i * FRAME_SAMPLES));
    return {
      type: "end",
      startedAt: this.segStart,
      endedAt: now,
      audio,
      durationMs: frames.length * FRAME_MS,
      playbackOverlap: this.voicedFrames ? this.overlapFrames / this.voicedFrames : 0,
      forced,
    };
  }

  private reset(): void {
    this.seg = [];
    this.ring = [];
    this.inSpeech = false;
    this.confirmed = false;
    this.voicedMs = 0;
    this.silenceMs = 0;
    this.overlapFrames = 0;
    this.voicedFrames = 0;
  }
}

// ---------------------------------------------------------------------------
// Echo filter
// ---------------------------------------------------------------------------

function words(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
}

/**
 * True when a transcribed clip is the agent's own voice picked up by a microphone: most of its words occur in a recent agent line. Used after
 * transcription for clips that overlapped playback. A person quoting a few words of the agent is not dropped (they must be most of the clip).
 */
export function isEchoOfAgent(text: string, recentAgentLines: string[], minWords = 3, share = 0.7): boolean {
  const w = words(text);
  if (w.length < minWords) return false;
  for (const line of recentAgentLines) {
    const pool = new Set(words(line));
    if (!pool.size) continue;
    const hit = w.filter((x) => pool.has(x)).length;
    if (hit / w.length >= share) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Upload queue (retry, idempotent ids, bounded)
// ---------------------------------------------------------------------------

export interface SttClip {
  /** Idempotent: the same id is sent again on retry, the server never charges or stores it twice. */
  id: string;
  startedAt: number;
  durationMs: number;
  wav: Uint8Array;
  playbackOverlap: number;
}

export type SttOutcome =
  | { kind: "text"; clip: SttClip; text: string; language: string | null }
  | { kind: "empty"; clip: SttClip }
  | { kind: "dropped"; clip: SttClip; reason: "queue-full" | "gave-up" | "refused" }
  | { kind: "auth-expired"; clip: SttClip }
  | { kind: "blocked"; clip: SttClip; status: number; message: string };

export interface SttTransport {
  send(clip: SttClip, signal: AbortSignal): Promise<{ status: number; body: unknown; retryAfterSecs?: number }>;
}

export interface SttQueueOptions {
  maxQueue: number;
  concurrency: number;
  maxAttempts: number;
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

export class SttQueue {
  private queue: SttClip[] = [];
  private running = 0;
  private closed = false;
  private readonly ctl = new AbortController();
  private readonly o: SttQueueOptions;
  private idle: Array<() => void> = [];

  constructor(private readonly transport: SttTransport, private readonly onOutcome: (o: SttOutcome) => void, opts: Partial<SttQueueOptions> = {}) {
    this.o = { maxQueue: 6, concurrency: 2, maxAttempts: 4, baseDelayMs: 800, ...opts };
  }

  get size(): number {
    return this.queue.length + this.running;
  }

  submit(clip: SttClip): void {
    if (this.closed) return;
    if (this.queue.length >= this.o.maxQueue) {
      const old = this.queue.shift();
      if (old) this.onOutcome({ kind: "dropped", clip: old, reason: "queue-full" });
    }
    this.queue.push(clip);
    this.pump();
  }

  /** Stop accepting and abort what is in flight (leaving the meeting). */
  close(): void {
    this.closed = true;
    this.queue = [];
    this.ctl.abort();
    this.wake();
  }

  /** Resolves when nothing is queued or running. */
  drained(): Promise<void> {
    if (!this.size) return Promise.resolve();
    return new Promise((r) => this.idle.push(r));
  }

  private wake() {
    if (this.size) return;
    const w = this.idle;
    this.idle = [];
    w.forEach((f) => f());
  }

  private pump(): void {
    while (!this.closed && this.running < this.o.concurrency && this.queue.length) {
      const clip = this.queue.shift()!;
      this.running++;
      void this.run(clip)
        .catch(() => this.onOutcome({ kind: "dropped", clip, reason: "gave-up" }))
        .finally(() => {
          this.running--;
          this.pump();
          this.wake();
        });
    }
  }

  private async run(clip: SttClip): Promise<void> {
    const sleep = this.o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    for (let attempt = 1; attempt <= this.o.maxAttempts; attempt++) {
      if (this.closed) return;
      let res: { status: number; body: unknown; retryAfterSecs?: number } | null = null;
      try {
        res = await this.transport.send(clip, this.ctl.signal);
      } catch {
        res = null; // network loss: retry with the same id
      }
      if (this.closed) return;
      if (res && res.status >= 200 && res.status < 300) {
        const b = (res.body ?? {}) as { text?: unknown; language?: unknown };
        const text = typeof b.text === "string" ? b.text.trim() : "";
        this.onOutcome(text ? { kind: "text", clip, text, language: typeof b.language === "string" ? b.language : null } : { kind: "empty", clip });
        return;
      }
      if (res && res.status === 401) return void this.onOutcome({ kind: "auth-expired", clip });
      if (res && (res.status === 402 || res.status === 409 || res.status === 403)) {
        const msg = (res.body as { error?: unknown } | null)?.error;
        return void this.onOutcome({ kind: "blocked", clip, status: res.status, message: typeof msg === "string" ? msg : "Speech recognition is not available" });
      }
      if (res && res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) return void this.onOutcome({ kind: "dropped", clip, reason: "refused" });
      if (attempt === this.o.maxAttempts) break;
      const wait = res?.retryAfterSecs ? Math.min(15_000, res.retryAfterSecs * 1000) : Math.min(8000, this.o.baseDelayMs * 2 ** (attempt - 1));
      await sleep(wait);
    }
    this.onOutcome({ kind: "dropped", clip, reason: "gave-up" });
  }
}

/** A stable, collision-resistant id for a clip: who, when it started, a counter and a random suffix. */
export function makeUtteranceId(participantId: string, startedAt: number, counter: number, rand: () => number = Math.random): string {
  return `${participantId.slice(0, 24)}-${Math.floor(startedAt).toString(36)}-${counter.toString(36)}-${Math.floor(rand() * 36 ** 4).toString(36)}`;
}
