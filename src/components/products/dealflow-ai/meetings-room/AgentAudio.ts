import { LocalAudioTrack, Track, type LocalTrackPublication, type Room } from "livekit-client";

/**
 * The runner's audio side: every AI agent gets its own WebAudio output that is published into the LiveKit room as that agent's own audio track
 * (named `agent:<participantId>`), so every participant hears the agent as a separate voice. The runner also hears it locally.
 */
interface Voice {
  gain: GainNode;
  dest: MediaStreamAudioDestinationNode;
  track: LocalAudioTrack | null;
  pub: LocalTrackPublication | null;
  publishing: Promise<void> | null;
}

export const AGENT_TRACK_PREFIX = "agent:";

export class AgentAudioHub {
  private ctx: AudioContext | null = null;
  private voices = new Map<string, Voice>();
  private playing = 0;
  private disposed = false;

  constructor(private readonly room: Room) {}

  static supported(): boolean {
    return typeof window !== "undefined" && typeof AudioContext !== "undefined" && typeof MediaStreamAudioDestinationNode !== "undefined" && typeof RTCPeerConnection !== "undefined";
  }

  get isPlaying(): boolean {
    return this.playing > 0;
  }

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: "interactive" });
    return this.ctx;
  }

  /** Must run from a user gesture the first time (the join button), later calls are cheap. */
  async resume(): Promise<void> {
    const ctx = this.context();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  }

  private voice(agentId: string): Voice {
    let v = this.voices.get(agentId);
    if (!v) {
      const ctx = this.context();
      const gain = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();
      gain.connect(dest);
      gain.connect(ctx.destination); // the runner hears the agent too (LiveKit never plays your own tracks back)
      v = { gain, dest, track: null, pub: null, publishing: null };
      this.voices.set(agentId, v);
    }
    return v;
  }

  /** Publishes the agent's voice track once; later calls wait for / reuse it. */
  private async ensurePublished(agentId: string, participantId: string): Promise<void> {
    const v = this.voice(agentId);
    if (v.pub) return;
    v.publishing ??= (async () => {
      const mst = v.dest.stream.getAudioTracks()[0];
      if (!mst) throw new Error("no audio output");
      v.track = new LocalAudioTrack(mst, undefined, false, this.context());
      v.pub = await this.room.localParticipant.publishTrack(v.track, { name: `${AGENT_TRACK_PREFIX}${participantId}`, source: Track.Source.Unknown, dtx: true, red: false, stopMicTrackOnMute: false });
    })().finally(() => {
      v.publishing = null;
    });
    await v.publishing;
  }

  /** Decodes and plays one sentence. Resolves when it ended or `signal` aborted (after a short fade-out). */
  async play(agentId: string, participantId: string, audio: ArrayBuffer, signal: AbortSignal): Promise<void> {
    if (this.disposed || signal.aborted) return;
    await this.resume();
    await this.ensurePublished(agentId, participantId);
    if (this.disposed || signal.aborted) return;
    const ctx = this.context();
    const buffer = await ctx.decodeAudioData(audio.slice(0));
    if (this.disposed || signal.aborted) return;
    const v = this.voice(agentId);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    v.gain.gain.cancelScheduledValues(ctx.currentTime);
    v.gain.gain.setValueAtTime(1, ctx.currentTime);
    src.connect(v.gain);
    this.playing++;
    await new Promise<void>((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        signal.removeEventListener("abort", onAbort);
        try {
          src.disconnect();
        } catch {
          /* already disconnected */
        }
        resolve();
      };
      const onAbort = () => {
        // A quick fade so the voice does not click off.
        v.gain.gain.cancelScheduledValues(ctx.currentTime);
        v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.025);
        window.setTimeout(() => {
          try {
            src.stop();
          } catch {
            /* not started or already stopped */
          }
          done();
        }, 110);
      };
      src.onended = done;
      signal.addEventListener("abort", onAbort);
      src.start();
    }).finally(() => {
      this.playing = Math.max(0, this.playing - 1);
    });
  }

  async unpublish(agentId: string): Promise<void> {
    const v = this.voices.get(agentId);
    if (!v) return;
    this.voices.delete(agentId);
    try {
      if (v.track) await this.room.localParticipant.unpublishTrack(v.track, true);
    } catch {
      /* room already closed */
    }
    v.track?.stop();
    v.gain.disconnect();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await Promise.all([...this.voices.keys()].map((id) => this.unpublish(id)));
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
