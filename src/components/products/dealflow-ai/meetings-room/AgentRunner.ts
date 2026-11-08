import { CONTINUE_OFFER, TurnManager, estimateSpeechSecs, type TurnEntry } from "@/lib/dealflow-ai/meetings/turn-taking";
import { ClaimBook, FollowUpMemory, RollingTranscript, type AgentLiveState, type RoomMessage } from "@/lib/dealflow-ai/meetings/runtime";
import { SentenceChunker, SpeechPipeline } from "@/lib/dealflow-ai/meetings/tts-queue";
import { detectAddressed, orderByMention, type WakeAgent } from "@/lib/dealflow-ai/meetings/wake";
import type { AgentRuntimeSettings, MeetingUtterance, ParticipantKind } from "@/lib/dealflow-ai/meetings/types";
import type { AgentAudioHub } from "./AgentAudio";
import type { RoomAgent } from "./types";

/**
 * The agent runner. Exactly one staff browser runs this (elected, see runtime.ts). It listens to the room's lines, decides which agents are
 * addressed, asks the server for each answer, speaks it sentence by sentence in the agent's own voice into the room, and publishes what it said.
 */

export interface RunnerHost {
  roomId: string;
  selfId: string;
  settings: AgentRuntimeSettings;
  hub: AgentAudioHub;
  transcript: RollingTranscript;
  followUps: FollowUpMemory;
  agents(): RoomAgent[];
  humanNames(): string[];
  send(m: RoomMessage): void;
  /** Add to the local transcript, share on the data channel and store it. */
  publishAgentLine(u: MeetingUtterance): void;
  setAgentState(agentId: string, state: AgentLiveState, utteranceId?: string): void;
  onFailure(kind: "budget" | "error" | "ok"): void;
  now?(): number;
}

interface Active {
  entry: TurnEntry;
  fetchCtl: AbortController;
  pipeline: SpeechPipeline | null;
  cancelled: boolean;
  /** Stopped because another runner took over or the agent was muted: nothing of it is published. */
  discard: boolean;
}

export class AgentRunner {
  private readonly turn: TurnManager;
  private readonly claims = new ClaimBook();
  private timer: ReturnType<typeof setInterval> | null = null;
  private active: Active | null = null;
  private answers = new Map<string, Array<{ agentId: string; name: string; text: string }>>();
  private stopped = false;

  constructor(private readonly h: RunnerHost) {
    this.turn = new TurnManager({ allowBargeIn: h.settings.allowBargeIn });
  }

  private now(): number {
    return this.h.now ? this.h.now() : Date.now();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 120);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.cancelActive(false);
    this.turn.clear();
  }

  /** Lines already answered (or claimed) by a runner before this one: never answer them again. */
  markHandled(utteranceId: string, agentId: string): void {
    this.turn.markHandled(utteranceId, agentId);
  }

  /** Another runner announced it is answering a line: the smaller identity keeps it. */
  observeClaim(key: string, runner: string): void {
    const winner = this.claims.claim(key, runner);
    if (winner !== this.h.selfId && this.active?.entry.key === key) this.cancelActive(false, true);
    const [utteranceId, agentId] = key.split(":");
    if (winner !== this.h.selfId && utteranceId && agentId) this.turn.markHandled(utteranceId, agentId);
  }

  /** The host muted this agent: cut it off now and drop its queued answers. */
  muteAgent(agentId: string): void {
    if (this.active?.entry.agentId === agentId) this.cancelActive(false, true);
    this.turn.clear(agentId);
  }

  humanVoice(active: boolean): void {
    const act = this.turn.humanActivity(active, this.now());
    if (act?.type === "barge-in") this.cancelActive(true);
  }

  /** A final line from a person (spoken or typed). */
  onLine(u: MeetingUtterance): void {
    if (this.stopped || u.speakerKind === "agent") return;
    const live = this.h.agents().filter((a) => a.available && !a.muted);
    if (!live.length) return;
    const wakeAgents: WakeAgent[] = live.map((a) => ({ id: a.id, name: a.name, aliases: a.aliases }));
    const own = detectAddressed({
      text: u.text,
      speaker: { id: u.speakerId, kind: u.speakerKind as ParticipantKind },
      agents: wakeAgents,
      now: this.now(),
      followUps: this.h.followUps.list(),
      followUpWindowSecs: this.h.settings.followUpWindowSecs,
      humanNames: this.h.humanNames(),
    });
    // What the speaker's own browser detected counts too (it may know a newer roster), limited to agents that can answer now.
    const bySender = (u.addressedTo ?? []).filter((id) => live.some((a) => a.id === id));
    const ids = [...new Set([...own.agentIds, ...bySender])];
    if (!ids.length) return;
    const ordered = orderByMention(u.text, ids, wakeAgents);
    this.turn.enqueue({ utteranceId: u.id, agentIds: ordered, text: u.text, speakerId: u.speakerId, speakerKind: u.speakerKind, at: this.now() });
  }

  private tick(): void {
    if (this.stopped || this.active) return;
    const act = this.turn.next(this.now());
    if (act?.type === "speak") void this.speak(act.entry).catch(() => this.h.onFailure("error"));
  }

  private cancelActive(bargeIn: boolean, discard = false): void {
    const a = this.active;
    if (!a) return;
    a.cancelled = true;
    a.discard = discard;
    a.fetchCtl.abort();
    a.pipeline?.stop();
    if (bargeIn) this.h.setAgentState(a.entry.agentId, "listening");
  }

  private async speak(entry: TurnEntry): Promise<void> {
    const agent = this.h.agents().find((a) => a.id === entry.agentId);
    if (!agent || agent.muted || !agent.available) {
      this.turn.finish(entry.key);
      return;
    }
    const act: Active = { entry, fetchCtl: new AbortController(), pipeline: null, cancelled: false, discard: false };
    this.active = act;
    this.h.send({ t: "claim", key: entry.key, runner: this.h.selfId });
    this.claims.claim(entry.key, this.h.selfId);
    this.h.setAgentState(agent.id, "thinking", entry.utteranceId);

    const maxSecs = Math.max(5, this.h.settings.maxAnswerSecs);
    const chunker = new SentenceChunker();
    const pipeline = new SpeechPipeline({
      fetchAudio: async (text, signal) => {
        const res = await fetch("/api/dealflow-ai/meetings/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: this.h.roomId, agentId: agent.id, text }),
          signal,
        });
        if (!res.ok) {
          if (res.status === 402) this.h.onFailure("budget");
          throw new Error(String(res.status));
        }
        return res.arrayBuffer();
      },
      play: (audio, signal) => this.h.hub.play(agent.id, agent.participantId, audio, signal),
      onSentenceStart: () => this.h.setAgentState(agent.id, "speaking", entry.utteranceId),
    });
    act.pipeline = pipeline;
    const running = pipeline.run();

    let used = 0;
    let truncated = false;
    let count = 0;
    let failure: "budget" | "error" | null = null;
    const take = (sentences: string[]) => {
      for (const s of sentences) {
        if (truncated) return;
        const secs = estimateSpeechSecs(s);
        if (count > 0 && used + secs > maxSecs) {
          truncated = true;
          pipeline.enqueue(CONTINUE_OFFER);
          return;
        }
        used += secs;
        count++;
        pipeline.enqueue(s);
      }
    };

    try {
      const res = await fetch("/api/dealflow-ai/meetings/agent-speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: act.fetchCtl.signal,
        body: JSON.stringify({
          roomId: this.h.roomId,
          agentId: agent.id,
          utteranceId: entry.utteranceId,
          text: entry.text,
          speakerId: entry.speakerId,
          transcript: this.h.transcript.recent({ untilId: entry.utteranceId }).map((l) => ({ speakerId: l.speakerId, speakerName: l.speakerName, speakerKind: l.speakerKind, text: l.text })),
          alreadyAnswered: (this.answers.get(entry.utteranceId) ?? []).slice(0, 3),
        }),
      });
      if (!res.ok || !res.body) {
        failure = res.status === 402 ? "budget" : "error";
      } else {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let finished = false;
        while (!finished && !truncated && !act.cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let msg: { d?: string; done?: boolean; error?: string };
            try {
              msg = JSON.parse(line);
            } catch {
              continue;
            }
            if (msg.d) take(chunker.push(msg.d));
            if (msg.error && count === 0) failure = "error";
            if (msg.done) finished = true;
          }
        }
        if (!truncated && !act.cancelled) take(chunker.flush());
        else if (truncated) void reader.cancel().catch(() => {});
      }
    } catch {
      if (!act.cancelled) failure = failure ?? "error";
    }
    pipeline.finishInput();
    const result = await running;

    this.active = null;
    this.turn.finish(entry.key);
    this.h.setAgentState(agent.id, this.h.agents().find((a) => a.id === agent.id)?.muted ? "muted" : "listening");
    if (act.discard || this.stopped) return;
    if (failure && !result.spoken.length) {
      this.h.onFailure(failure);
      return;
    }
    if (result.error && !result.spoken.length) this.h.onFailure("error");
    else this.h.onFailure("ok");

    // What was actually said (a barge-in leaves only the sentences that finished) is what goes into the transcript.
    const spokenText = result.spoken.join(" ").trim();
    if (!spokenText || act.cancelled && !result.spoken.length) return;
    const line: MeetingUtterance = {
      id: `ag-${entry.key}`,
      at: this.now(),
      speakerId: agent.participantId,
      speakerName: agent.name,
      speakerKind: "agent",
      text: spokenText,
      addressedTo: [entry.speakerId],
      final: true,
    };
    const list = this.answers.get(entry.utteranceId) ?? [];
    list.push({ agentId: agent.id, name: agent.name, text: spokenText.slice(0, 700) });
    this.answers.set(entry.utteranceId, list);
    if (this.answers.size > 40) this.answers.delete(this.answers.keys().next().value as string);
    this.h.followUps.record({ agentId: agent.id, at: line.at, toSpeakerId: entry.speakerId });
    this.h.publishAgentLine(line);
  }
}
