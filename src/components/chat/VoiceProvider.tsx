"use client";

import * as React from "react";
import { useChat, type AssistantDoneInfo } from "@/components/chat/ChatProvider";
import { useBrand } from "@/components/platform/BrandProvider";

export type VoiceStatus = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

/** Coarse, user-facing phase collapsed from {@link VoiceStatus} for status displays. */
export type VoicePhase = "ready" | "listening" | "processing" | "speaking";

export function toPhase(status: VoiceStatus): VoicePhase {
  switch (status) {
    case "listening":
      return "listening";
    case "transcribing":
    case "thinking":
      return "processing";
    case "speaking":
      return "speaking";
    default:
      return "ready";
  }
}

interface VoiceContextValue {
  supported: boolean;
  available: boolean;
  /** "browser" = Web Speech APIs (demo); "elevenlabs" = server STT/TTS. */
  pipeline: "browser" | "elevenlabs";
  voiceMode: boolean;
  status: VoiceStatus;
  phase: VoicePhase;
  level: number;
  recordingMs: number;
  muted: boolean;
  hint: string | null;
  error: string | null;
  canReplay: boolean;
  setVoiceMode: (on: boolean) => void;
  toggleListening: () => void;
  stopListening: () => void;
  interrupt: () => void;
  replayLast: () => void;
  toggleMute: () => void;
  dismissHint: () => void;
}

const VoiceContext = React.createContext<VoiceContextValue | null>(null);

export function useVoice(): VoiceContextValue {
  const ctx = React.useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within <VoiceProvider>");
  return ctx;
}

const MAX_RECORDING_MS = 60_000;
const SILENCE_MS = 1600; // auto-stop after this much quiet (once speech was detected)

function lsGet(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

// --- Web Speech API (browser pipeline) ---------------------------------------

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Flattens Markdown to something a speech synthesiser reads cleanly. */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>#]/g, "")
    .replace(/^\s*[-–]\s+/gm, ", ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const brand = useBrand();
  const { send, config, visitorName, pushAssistantMessage } = useChat();

  const pipeline: "browser" | "elevenlabs" =
    config?.voice?.mode === "browser" ? "browser" : "elevenlabs";

  // Gate browser-capability checks until after mount so SSR and the first client
  // render agree (both treat voice as unsupported).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount gate for SSR-safe capability checks
    setMounted(true);
  }, []);

  const [voiceMode, setVoiceModeState] = React.useState(false);
  const [status, setStatus] = React.useState<VoiceStatus>("idle");
  const [level, setLevel] = React.useState(0);
  const [recordingMs, setRecordingMs] = React.useState(0);
  const [muted, setMuted] = React.useState(false);
  const [hint, setHint] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [canReplay, setCanReplay] = React.useState(false);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = React.useRef(0);
  const audioElRef = React.useRef<HTMLAudioElement | null>(null);
  const elSourceRef = React.useRef<MediaElementAudioSourceNode | null>(null);
  const speakAbortRef = React.useRef<AbortController | null>(null);
  const lastBlobUrlRef = React.useRef<string | null>(null);
  const spokeAtRef = React.useRef(0);
  const silenceStartRef = React.useRef(0);
  const pendingTurnRef = React.useRef<{
    transcriptId: string;
    userText: string;
    userAudioDurationMs: number;
    sttMs: number;
  } | null>(null);
  const statusRef = React.useRef<VoiceStatus>("idle");
  const mutedRef = React.useRef(false);
  const stopListeningRef = React.useRef<() => void>(() => {});

  // Browser pipeline refs
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  const recognitionAbortedRef = React.useRef(false);
  const browserTranscriptRef = React.useRef("");
  const lastSpokenRef = React.useRef("");
  const speakOscRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Voice Mode greeting.
  const visitorNameRef = React.useRef<string | null>(null);

  // Hands-free loop: after the assistant finishes speaking, reopen the mic so
  // the visitor can just keep talking. `suppress` skips it once (Stop / replay /
  // leaving Voice Mode); `voiceModeRef` keeps the check cheap inside callbacks.
  const voiceModeRef = React.useRef(false);
  const suppressAutoListenRef = React.useRef(false);
  const maybeAutoListenRef = React.useRef<() => void>(() => {});

  // Mirror render state into refs for use inside RAF loops / recorder callbacks.
  React.useEffect(() => {
    statusRef.current = status;
  }, [status]);
  React.useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  React.useEffect(() => {
    visitorNameRef.current = visitorName;
  }, [visitorName]);

  const mediaRecorderSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const browserVoiceSupported =
    typeof window !== "undefined" &&
    !!getSpeechRecognitionCtor() &&
    "speechSynthesis" in window &&
    !!navigator.mediaDevices?.getUserMedia;

  const supported =
    mounted && (pipeline === "browser" ? browserVoiceSupported : mediaRecorderSupported);
  const available = supported && Boolean(config?.voice?.available);

  // Restore persisted prefs after mount (kept out of the server render). Voice
  // Mode itself always starts OFF so that tapping "Voice" is a real transition
  // — which is what triggers the spoken welcome + hands-free listening.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
    setMuted(lsGet("yo_voice_muted", false));
  }, []);

  // One shared <audio> element + analyser graph for playback metering (elevenlabs).
  React.useEffect(() => {
    const el = new Audio();
    el.preload = "auto";
    audioElRef.current = el;
    const onEnded = () => {
      if (statusRef.current === "speaking") setStatus("idle");
      maybeAutoListenRef.current();
    };
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("ended", onEnded);
      el.pause();
      audioElRef.current = null;
    };
  }, []);

  const stopMeter = React.useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setLevel(0);
  }, []);

  const runMeter = React.useCallback(
    (analyser: AnalyserNode, meterMode: "listen" | "speak", autoStop = meterMode === "listen") => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const scaled = Math.min(1, rms * (meterMode === "listen" ? 3.2 : 2.4));
        setLevel(scaled);

        if (meterMode === "listen" && autoStop) {
          const now = performance.now();
          if (scaled > 0.06) {
            spokeAtRef.current = now;
            silenceStartRef.current = 0;
          } else if (spokeAtRef.current > 0) {
            if (silenceStartRef.current === 0) silenceStartRef.current = now;
            else if (now - silenceStartRef.current > SILENCE_MS) {
              stopListeningRef.current();
              return;
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    []
  );

  const teardownRecording = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    stopMeter();
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [stopMeter]);

  // --- Browser speech synthesis ------------------------------------------

  const stopSpeakOsc = React.useCallback(() => {
    if (speakOscRef.current) clearInterval(speakOscRef.current);
    speakOscRef.current = null;
    setLevel(0);
  }, []);

  const startSpeakOsc = React.useCallback(() => {
    stopSpeakOsc();
    speakOscRef.current = setInterval(() => {
      setLevel(0.28 + Math.random() * 0.45);
    }, 110);
  }, [stopSpeakOsc]);

  const speakTextBrowser = React.useCallback(
    (text: string, onEnd?: () => void) => {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
      if (!synth) {
        setStatus("idle");
        onEnd?.();
        return;
      }
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(stripMarkdown(text).slice(0, 4000));
      utter.rate = 1;
      utter.pitch = 1;
      const voices = synth.getVoices();
      const preferred =
        voices.find((v) => /en[-_]us/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang));
      if (preferred) utter.voice = preferred;
      let ended = false;
      const finish = () => {
        if (ended) return;
        ended = true;
        stopSpeakOsc();
        if (statusRef.current === "speaking") setStatus("idle");
        onEnd?.();
      };
      utter.onend = finish;
      utter.onerror = finish;
      setStatus("speaking");
      startSpeakOsc();
      synth.speak(utter);
    },
    [startSpeakOsc, stopSpeakOsc]
  );

  const speakBrowser = React.useCallback(
    (info: AssistantDoneInfo) => {
      lastSpokenRef.current = info.text;
      setCanReplay(true);
      pendingTurnRef.current = null;
      suppressAutoListenRef.current = false; // a fresh answer → keep the conversation going
      if (mutedRef.current) {
        setStatus("idle");
        maybeAutoListenRef.current();
        return;
      }
      speakTextBrowser(info.text, () => maybeAutoListenRef.current());
    },
    [speakTextBrowser]
  );

  // --- ElevenLabs playback ----------------------------------------------

  const cleanupLastBlob = React.useCallback(() => {
    if (lastBlobUrlRef.current) {
      URL.revokeObjectURL(lastBlobUrlRef.current);
      lastBlobUrlRef.current = null;
    }
  }, []);

  const attachSpeakMeter = React.useCallback(() => {
    const el = audioElRef.current;
    if (!el) return;
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      if (!elSourceRef.current) {
        elSourceRef.current = ctx.createMediaElementSource(el);
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      elSourceRef.current.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      runMeter(analyser, "speak");
    } catch {
      /* metering is optional */
    }
  }, [runMeter]);

  const playBlob = React.useCallback(
    (blob: Blob) => {
      const el = audioElRef.current;
      if (!el) return;
      cleanupLastBlob();
      const url = URL.createObjectURL(blob);
      lastBlobUrlRef.current = url;
      setCanReplay(true);
      el.src = url;
      el.muted = mutedRef.current;
      attachSpeakMeter();
      void el.play().catch(() => {});
    },
    [attachSpeakMeter, cleanupLastBlob]
  );

  const speak = React.useCallback(
    async (info: AssistantDoneInfo) => {
      if (!available) {
        setStatus("idle");
        return;
      }
      suppressAutoListenRef.current = false; // a fresh answer → reopen the mic after
      setStatus("speaking");
      spokeAtRef.current = 0;
      const controller = new AbortController();
      speakAbortRef.current = controller;
      const pending = pendingTurnRef.current;
      pendingTurnRef.current = null;
      try {
        const res = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: info.text,
            chatMessageId: info.messageId,
            userChatMessageId: info.userMessageId,
            transcriptId: pending?.transcriptId,
            userText: pending?.userText,
            userAudioDurationMs: pending?.userAudioDurationMs,
            sttMs: pending?.sttMs,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          setStatus("idle");
          setError("Couldn't play the voice reply.");
          return;
        }
        const buf = await res.arrayBuffer();
        if (controller.signal.aborted) return;
        playBlob(new Blob([buf], { type: "audio/mpeg" }));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setStatus("idle");
        setError("Voice playback failed.");
      } finally {
        speakAbortRef.current = null;
      }
    },
    [available, playBlob]
  );

  // --- Recording / transcription (elevenlabs) ---------------------------

  const transcribeAndSend = React.useCallback(
    async (blob: Blob) => {
      setStatus("transcribing");
      const form = new FormData();
      form.append("audio", blob, "speech.webm");
      try {
        const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus("idle");
          setError(json.error ?? "Voice mode is unavailable right now.");
          return;
        }
        if (json.empty || !json.text) {
          setStatus("idle");
          setHint("Didn't catch that — try again.");
          return;
        }
        pendingTurnRef.current = {
          transcriptId: typeof json.transcriptId === "string" ? json.transcriptId : "",
          userText: json.text,
          userAudioDurationMs: typeof json.audioDurationMs === "number" ? json.audioDurationMs : 0,
          sttMs: typeof json.sttMs === "number" ? json.sttMs : 0,
        };
        setStatus("thinking");
        send(json.text, { voice: true, onAssistantDone: speak });
      } catch {
        setStatus("idle");
        setError("Network error — please try again.");
      }
    },
    [send, speak]
  );

  const stopListening = React.useCallback(() => {
    if (pipeline === "browser") {
      recognitionRef.current?.stop();
      return;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, [pipeline]);
  React.useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  const startListeningBrowser = React.useCallback(async () => {
    if (statusRef.current === "listening") return;
    setError(null);
    setHint(null);
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    stopSpeakOsc();

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Voice input isn't supported in this browser.");
      return;
    }

    // Optional mic meter so the waveform reacts while the recogniser runs.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current ??= new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current = analyser;
      runMeter(analyser, "listen", false); // recogniser owns silence detection
    } catch {
      // Meter is optional; if the mic is blocked the recogniser will error below.
    }

    const rec = new Ctor();
    rec.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    recognitionAbortedRef.current = false;
    browserTranscriptRef.current = "";

    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      browserTranscriptRef.current = text.trim();
    };
    rec.onerror = (ev) => {
      if (ev?.error === "no-speech") setHint("Didn't catch that — try again.");
      else if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed")
        setError("Microphone access was denied.");
      else if (ev?.error !== "aborted") setError("Voice input error — please try again.");
    };
    rec.onend = () => {
      recognitionRef.current = null;
      teardownRecording();
      setRecordingMs(0);
      if (recognitionAbortedRef.current) {
        recognitionAbortedRef.current = false;
        return;
      }
      const text = browserTranscriptRef.current.trim();
      if (!text) {
        setStatus("idle");
        return;
      }
      setStatus("thinking");
      send(text, { voice: true, onAssistantDone: speakBrowser });
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      /* start() throws if already running — ignore */
    }

    startedAtRef.current = performance.now();
    setRecordingMs(0);
    timerRef.current = setInterval(() => {
      const ms = performance.now() - startedAtRef.current;
      setRecordingMs(ms);
      if (ms >= MAX_RECORDING_MS) recognitionRef.current?.stop();
    }, 100);

    setStatus("listening");
  }, [runMeter, teardownRecording, stopSpeakOsc, send, speakBrowser]);

  const startListening = React.useCallback(async () => {
    if (!available || statusRef.current === "listening") return;
    setError(null);
    setHint(null);
    audioElRef.current?.pause();
    speakAbortRef.current?.abort();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("Microphone access was denied.");
      return;
    }
    streamRef.current = stream;

    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current ??= new Ctx();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current = analyser;
      spokeAtRef.current = 0;
      silenceStartRef.current = 0;
      runMeter(analyser, "listen");
    } catch {
      /* metering optional */
    }

    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      teardownRecording();
      setRecordingMs(0);
      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      chunksRef.current = [];
      if (blob.size < 1200) {
        setStatus("idle");
        setHint("That was too short — hold the mic a little longer.");
        return;
      }
      void transcribeAndSend(blob);
    };
    mediaRecorderRef.current = rec;
    rec.start();

    startedAtRef.current = performance.now();
    setRecordingMs(0);
    timerRef.current = setInterval(() => {
      const ms = performance.now() - startedAtRef.current;
      setRecordingMs(ms);
      if (ms >= MAX_RECORDING_MS) stopListeningRef.current();
    }, 100);

    setStatus("listening");
  }, [available, runMeter, teardownRecording, transcribeAndSend]);

  const toggleListening = React.useCallback(() => {
    if (statusRef.current === "listening") {
      stopListening();
    } else if (statusRef.current === "idle") {
      if (pipeline === "browser") void startListeningBrowser();
      else void startListening();
    }
  }, [pipeline, startListening, startListeningBrowser, stopListening]);

  const interrupt = React.useCallback(() => {
    suppressAutoListenRef.current = true; // an explicit Stop ends the hands-free loop
    if (pipeline === "browser") {
      recognitionAbortedRef.current = true;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      stopSpeakOsc();
    }
    speakAbortRef.current?.abort();
    const el = audioElRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    teardownRecording();
    stopMeter();
    setRecordingMs(0);
    setStatus("idle");
  }, [pipeline, stopMeter, stopSpeakOsc, teardownRecording]);

  const replayLast = React.useCallback(() => {
    suppressAutoListenRef.current = true; // replaying isn't a new turn — don't reopen the mic
    if (pipeline === "browser") {
      if (!lastSpokenRef.current) return;
      speakTextBrowser(lastSpokenRef.current);
      return;
    }
    const el = audioElRef.current;
    if (!el || !lastBlobUrlRef.current) return;
    el.src = lastBlobUrlRef.current;
    el.muted = mutedRef.current;
    setStatus("speaking");
    attachSpeakMeter();
    void el.play().catch(() => {});
  }, [pipeline, speakTextBrowser, attachSpeakMeter]);

  const toggleMute = React.useCallback(() => {
    setMuted((m) => {
      const next = !m;
      lsSet("yo_voice_muted", next);
      if (audioElRef.current) audioElRef.current.muted = next;
      if (next && pipeline === "browser" && typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
        stopSpeakOsc();
        if (statusRef.current === "speaking") setStatus("idle");
      }
      return next;
    });
  }, [pipeline, stopSpeakOsc]);

  /** Opens the microphone using whichever pipeline is active. */
  const startVoiceInput = React.useCallback(() => {
    if (statusRef.current === "listening") return;
    if (pipeline === "browser") void startListeningBrowser();
    else void startListening();
  }, [pipeline, startListeningBrowser, startListening]);

  /** Reopen the mic after the assistant speaks, unless a Stop / replay / exit asked us not to. */
  const maybeAutoListen = React.useCallback(() => {
    if (suppressAutoListenRef.current) {
      suppressAutoListenRef.current = false;
      return;
    }
    if (!voiceModeRef.current) return;
    startVoiceInput();
  }, [startVoiceInput]);
  React.useEffect(() => {
    maybeAutoListenRef.current = maybeAutoListen;
  }, [maybeAutoListen]);

  const greet = React.useCallback(() => {
    const full = visitorNameRef.current?.trim();
    const first = full ? full.split(/\s+/)[0] : "";
    const text = first
      ? `Hi ${first}, welcome to ${brand.name}. How may I help you?`
      : `Welcome to ${brand.name}. How may I help you?`;
    lastSpokenRef.current = text;
    setCanReplay(true);
    suppressAutoListenRef.current = false;
    pushAssistantMessage(text, { voice: true });
    // Speak the greeting, then open the mic automatically so the visitor can
    // just start talking — no tap needed.
    if (mutedRef.current) maybeAutoListen();
    else speakTextBrowser(text, () => maybeAutoListen());
  }, [pushAssistantMessage, speakTextBrowser, maybeAutoListen, brand.name]);

  const setVoiceMode = React.useCallback(
    (on: boolean) => {
      const wasOn = voiceModeRef.current;
      setVoiceModeState(on);
      voiceModeRef.current = on;
      lsSet("yo_voice_mode", on);
      if (!on) {
        interrupt();
        return;
      }
      // Every time the visitor switches INTO Voice Mode: speak the welcome
      // message straight away and then open the mic — no tap needed anywhere.
      if (!wasOn) greet();
    },
    [interrupt, greet]
  );

  const dismissHint = React.useCallback(() => setHint(null), []);

  // Auto-clear transient messages
  React.useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 4000);
    return () => clearTimeout(t);
  }, [hint]);
  React.useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  React.useEffect(() => {
    return () => {
      teardownRecording();
      stopMeter();
      stopSpeakOsc();
      recognitionRef.current?.abort();
      speakAbortRef.current?.abort();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      cleanupLastBlob();
    };
  }, [teardownRecording, stopMeter, stopSpeakOsc, cleanupLastBlob]);

  const phase = toPhase(status);

  const value = React.useMemo<VoiceContextValue>(
    () => ({
      supported,
      available,
      pipeline,
      voiceMode,
      status,
      phase,
      level,
      recordingMs,
      muted,
      hint,
      error,
      canReplay,
      setVoiceMode,
      toggleListening,
      stopListening,
      interrupt,
      replayLast,
      toggleMute,
      dismissHint,
    }),
    [
      supported,
      available,
      pipeline,
      voiceMode,
      status,
      phase,
      level,
      recordingMs,
      muted,
      hint,
      error,
      canReplay,
      setVoiceMode,
      toggleListening,
      stopListening,
      interrupt,
      replayLast,
      toggleMute,
      dismissHint,
    ]
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}
