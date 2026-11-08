/**
 * From a streamed reply to speech, sentence by sentence: the text arrives in small deltas, is cut into sentences as soon as one is complete,
 * each sentence is turned into audio while the previous one is still playing (a small prefetch window), and playback can be stopped at any time
 * (a person started talking). Pure logic with the audio fetch and the player injected, so ordering, prefetch, retry and abort are unit-tested.
 */

const TERMINATORS = /[.!?।]/;

/**
 * Cuts streamed text into speakable sentences. A sentence ends at . ! ? or the Hindi danda followed by whitespace (so "2.5" and "Dr. Rao" survive);
 * a very long run without punctuation is cut at a comma, semicolon, dash or conjunction so the voice can start sooner; very short fragments are
 * joined to the next one so the voice does not stutter.
 */
export class SentenceChunker {
  private buf = "";
  private pendingShort = "";
  constructor(private readonly opts = { minChars: 18, softMax: 140, hardMax: 240 }) {}

  push(delta: string): string[] {
    this.buf += delta.replace(/\r?\n+/g, " ");
    return this.drain(false);
  }

  /** Call when the text is complete: whatever is left becomes the last sentence. */
  flush(): string[] {
    return this.drain(true);
  }

  private drain(final: boolean): string[] {
    const out: string[] = [];
    for (;;) {
      const cut = this.findCut(final);
      if (cut <= 0) break;
      const piece = this.buf.slice(0, cut).trim();
      this.buf = this.buf.slice(cut);
      if (!piece) continue;
      const joined = this.pendingShort ? `${this.pendingShort} ${piece}` : piece;
      if (joined.length < this.opts.minChars && !final) {
        this.pendingShort = joined;
        continue;
      }
      this.pendingShort = "";
      out.push(joined);
    }
    if (final) {
      const rest = `${this.pendingShort} ${this.buf}`.trim();
      this.pendingShort = "";
      this.buf = "";
      if (rest) out.push(rest);
    }
    return out;
  }

  private findCut(final: boolean): number {
    const b = this.buf;
    for (let i = 0; i < b.length; i++) {
      if (!TERMINATORS.test(b[i])) continue;
      const next = b[i + 1];
      if (next === undefined) {
        if (final) return b.length;
        return -1; // may be "2." of "2.5": wait for the next character
      }
      if (/\s/.test(next)) {
        const head = b.slice(0, i + 1);
        if (/\b(?:mr|mrs|ms|dr|prof|sr|jr|vs|etc|approx|inc|ltd)\.$/i.test(head) || /\b[A-Za-z]\.$/.test(head)) continue;
        return i + 1;
      }
    }
    if (b.length >= this.opts.softMax) {
      const window = b.slice(0, this.opts.hardMax);
      const m = [...window.matchAll(/[,;:—–-]\s|\s(?:and|but|or|aur|lekin|toh|because|so)\s/gi)].filter((x) => (x.index ?? 0) >= 40);
      if (m.length) {
        const last = m[m.length - 1];
        return (last.index ?? 0) + (/^[,;:—–-]/.test(last[0]) ? 1 : 0);
      }
      if (b.length >= this.opts.hardMax) {
        const sp = window.lastIndexOf(" ");
        return sp > 40 ? sp : this.opts.hardMax;
      }
    }
    return -1;
  }
}

export interface PipelineDeps {
  fetchAudio(text: string, signal: AbortSignal): Promise<ArrayBuffer>;
  /** Plays the audio and resolves when it ended or `signal` aborted (after fading out). */
  play(audio: ArrayBuffer, signal: AbortSignal, text: string): Promise<void>;
  /** Called when playback of a sentence begins (first audio of an answer = latency mark). */
  onSentenceStart?(text: string, index: number): void;
}

export interface PipelineResult {
  /** Sentences whose playback finished. */
  spoken: string[];
  /** Sentences that were never fully played (stopped, or failed). */
  unspoken: string[];
  stopped: boolean;
  error: string | null;
}

export class SpeechPipeline {
  private items: Array<{ text: string; audio?: Promise<ArrayBuffer> }> = [];
  private inputDone = false;
  private stopped = false;
  private readonly ctl = new AbortController();
  private waiter: (() => void) | null = null;
  private playCtl: AbortController | null = null;

  constructor(private readonly deps: PipelineDeps, private readonly opts = { prefetch: 2, fetchRetries: 1, maxSentences: 40 }) {}

  enqueue(text: string): void {
    if (this.stopped || this.inputDone || this.items.length >= this.opts.maxSentences) return;
    const t = text.trim();
    if (!t) return;
    this.items.push({ text: t });
    this.nudge();
  }

  finishInput(): void {
    this.inputDone = true;
    this.nudge();
  }

  /** Stops playback now (the player fades out) and drops the rest. */
  stop(): void {
    this.stopped = true;
    this.ctl.abort();
    this.playCtl?.abort();
    this.nudge();
  }

  private nudge(): void {
    const w = this.waiter;
    this.waiter = null;
    w?.();
  }

  private fetchFor(i: number): Promise<ArrayBuffer> {
    const item = this.items[i];
    if (!item.audio) {
      const attempt = async (): Promise<ArrayBuffer> => {
        let last: unknown;
        for (let n = 0; n <= this.opts.fetchRetries; n++) {
          if (this.ctl.signal.aborted) throw new Error("stopped");
          try {
            return await this.deps.fetchAudio(item.text, this.ctl.signal);
          } catch (e) {
            last = e;
          }
        }
        throw last instanceof Error ? last : new Error("voice failed");
      };
      item.audio = attempt();
      item.audio.catch(() => {}); // surfaced when awaited; never an unhandled rejection
    }
    return item.audio;
  }

  async run(): Promise<PipelineResult> {
    const spoken: string[] = [];
    let error: string | null = null;
    let i = 0;
    while (!this.stopped) {
      while (i >= this.items.length) {
        if (this.inputDone || this.stopped) break;
        await new Promise<void>((r) => (this.waiter = r));
      }
      if (this.stopped || i >= this.items.length) break;
      for (let k = i; k <= i + this.opts.prefetch && k < this.items.length; k++) void this.fetchFor(k);
      let audio: ArrayBuffer;
      try {
        audio = await this.fetchFor(i);
      } catch (e) {
        if (!this.stopped) error = e instanceof Error ? e.message : "voice failed";
        break;
      }
      if (this.stopped) break;
      this.playCtl = new AbortController();
      this.deps.onSentenceStart?.(this.items[i].text, i);
      try {
        await this.deps.play(audio, this.playCtl.signal, this.items[i].text);
      } catch (e) {
        if (!this.stopped) error = e instanceof Error ? e.message : "playback failed";
        break;
      }
      this.playCtl = null;
      if (this.stopped) break;
      spoken.push(this.items[i].text);
      i++;
    }
    this.ctl.abort();
    return { spoken, unspoken: this.items.slice(spoken.length).map((x) => x.text), stopped: this.stopped, error };
  }
}
