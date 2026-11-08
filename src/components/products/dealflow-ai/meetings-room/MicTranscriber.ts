import { FRAME_SAMPLES, Resampler, SttQueue, VadSegmenter, encodeWav, makeUtteranceId, type SttClip, type SttOutcome, type SttTransport } from "@/lib/dealflow-ai/meetings/transcribe";

/**
 * Captures one participant's microphone, cuts it into spoken utterances in the browser (voice-activity detection, no heavy dependency) and sends each
 * to the speech-to-text route with retries and idempotent ids. The audio never leaves the browser except as these short clips.
 */

const WORKLET = `class Tap extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c&&c.length)this.port.postMessage(c.slice(0));return true}}registerProcessor('tap',Tap);`;

export interface MicTranscriberOptions {
  roomId: string;
  participantId: string;
  token: string;
  /** Optional language hint for the recogniser ("" = detect, which handles Hindi and English mixed). */
  language: string;
  /** True while an agent's voice is audible on this device. */
  playbackActive(): boolean;
  onSpeechStart(): void;
  onSpeechEnd(): void;
  onOutcome(o: SttOutcome): void;
  onLevel?(rms: number): void;
}

export class MicTranscriber {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private resampler: Resampler | null = null;
  private pending = new Float32Array(0);
  private readonly vad = new VadSegmenter();
  private readonly queue: SttQueue;
  private counter = 0;
  private lastLevelAt = 0;
  private disposed = false;
  private loading: Promise<void> | null = null;
  private current: MediaStreamTrack | null = null;
  private lastAgentAudibleAt = 0;

  constructor(private readonly o: MicTranscriberOptions) {
    const transport: SttTransport = {
      send: async (clip, signal) => {
        const url = `/api/dealflow-ai/meetings/stt?roomId=${encodeURIComponent(o.roomId)}&u=${encodeURIComponent(clip.id)}&ms=${Math.round(clip.durationMs)}${o.language ? `&lang=${encodeURIComponent(o.language)}` : ""}`;
        const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${this.o.token}`, "Content-Type": "audio/wav" }, body: clip.wav as BodyInit, signal });
        const body = await res.json().catch(() => null);
        const ra = Number(res.headers.get("retry-after"));
        return { status: res.status, body, retryAfterSecs: Number.isFinite(ra) && ra > 0 ? ra : undefined };
      },
    };
    this.queue = new SttQueue(transport, (out) => this.o.onOutcome(out));
  }

  setToken(token: string): void {
    this.o.token = token;
  }

  /** Attach (or detach with null) the microphone track. Called again whenever the device changes or the mic is re-enabled. */
  async setTrack(track: MediaStreamTrack | null): Promise<void> {
    if (this.disposed) return;
    // Same live track as before (e.g. an unrelated track was published): keep the running graph and any clip in progress.
    if (track && track === this.current && this.node) return;
    this.current = track;
    await this.teardownGraph();
    if (!track || track.readyState !== "live") return;
    try {
      const ctx = (this.ctx ??= new AudioContext({ latencyHint: "interactive" }));
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      this.resampler = new Resampler(ctx.sampleRate);
      this.pending = new Float32Array(0);
      this.source = ctx.createMediaStreamSource(new MediaStream([track]));
      const sink = ctx.createGain();
      sink.gain.value = 0;
      sink.connect(ctx.destination);
      if (typeof AudioWorkletNode !== "undefined" && ctx.audioWorklet) {
        this.loading ??= ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" })));
        await this.loading;
        const n = new AudioWorkletNode(ctx, "tap", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
        n.port.onmessage = (e: MessageEvent<Float32Array>) => this.ingest(e.data);
        this.source.connect(n);
        n.connect(sink);
        this.node = n;
      } else {
        // Older browsers: the deprecated but universal script processor.
        const p = ctx.createScriptProcessor(2048, 1, 1);
        p.onaudioprocess = (e) => this.ingest(new Float32Array(e.inputBuffer.getChannelData(0)));
        this.source.connect(p);
        p.connect(sink);
        this.node = p;
      }
    } catch {
      await this.teardownGraph();
    }
  }

  /** Browsers pause audio contexts in background tabs or without a gesture. */
  async nudge(): Promise<void> {
    if (this.ctx?.state === "suspended") await this.ctx.resume().catch(() => {});
  }

  private ingest(chunk: Float32Array): void {
    if (this.disposed || !this.resampler) return;
    const down = this.resampler.push(chunk);
    if (!down.length) return;
    const merged = new Float32Array(this.pending.length + down.length);
    merged.set(this.pending);
    merged.set(down, this.pending.length);
    let off = 0;
    const now = Date.now();
    const playback = this.o.playbackActive();
    if (playback) this.lastAgentAudibleAt = now;
    // A short tail after playback ends still counts: the room echoes.
    const gated = playback || now - this.lastAgentAudibleAt < 350;
    while (merged.length - off >= FRAME_SAMPLES) {
      const frame = merged.subarray(off, off + FRAME_SAMPLES);
      off += FRAME_SAMPLES;
      for (const ev of this.vad.push(frame, now, gated)) {
        if (ev.type === "start") this.o.onSpeechStart();
        else {
          this.o.onSpeechEnd();
          this.queue.submit(this.clip(ev.startedAt, ev.durationMs, ev.audio, ev.playbackOverlap));
        }
      }
    }
    this.pending = merged.slice(off);
    if (this.o.onLevel && now - this.lastLevelAt > 80) {
      this.lastLevelAt = now;
      let s = 0;
      for (let i = 0; i < chunk.length; i++) s += chunk[i] * chunk[i];
      this.o.onLevel(Math.sqrt(s / Math.max(1, chunk.length)));
    }
  }

  private clip(startedAt: number, durationMs: number, audio: Float32Array, playbackOverlap: number): SttClip {
    return { id: makeUtteranceId(this.o.participantId, startedAt, ++this.counter), startedAt, durationMs, wav: encodeWav(audio), playbackOverlap };
  }

  private async teardownGraph(): Promise<void> {
    if (this.vad.active) this.o.onSpeechEnd();
    try {
      if (this.node instanceof AudioWorkletNode) this.node.port.onmessage = null;
      if (this.node && "onaudioprocess" in this.node) (this.node as ScriptProcessorNode).onaudioprocess = null;
      this.source?.disconnect();
      this.node?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.source = null;
    this.node = null;
    for (const ev of this.vad.flush(Date.now())) {
      if (ev.type === "end") this.queue.submit(this.clip(ev.startedAt, ev.durationMs, ev.audio, ev.playbackOverlap));
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    await this.teardownGraph();
    this.disposed = true;
    this.queue.close();
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
