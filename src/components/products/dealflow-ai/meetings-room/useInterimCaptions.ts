"use client";

import { useEffect, useState } from "react";

interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
}

function ctor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const captionsSupported = () => ctor() !== null;

/**
 * Optional live captions of this person's own voice while the real transcript is being prepared. Progressive enhancement (Chrome and Safari): it
 * only shows text locally, is never sent to anyone and never stored; the speech-to-text route produces the shared transcript.
 */
export function useInterimCaptions(enabled: boolean, lang: string): string {
  const [text, setText] = useState("");
  useEffect(() => {
    const C = ctor();
    if (!enabled || !C) return;
    let stopped = false;
    let clear: ReturnType<typeof setTimeout> | null = null;
    const rec = new C();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.onresult = (e) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      setText(t.trim().slice(-160));
      if (clear) clearTimeout(clear);
      clear = setTimeout(() => setText(""), 2500);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") stopped = true;
    };
    rec.onend = () => {
      if (!stopped) {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };
    try {
      rec.start();
    } catch {
      stopped = true;
    }
    return () => {
      stopped = true;
      if (clear) clearTimeout(clear);
      rec.onend = null;
      rec.onresult = null;
      try {
        rec.stop();
      } catch {
        /* not running */
      }
      setText("");
    };
  }, [enabled, lang]);
  return enabled ? text : "";
}
