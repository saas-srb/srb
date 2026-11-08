"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video } from "lucide-react";
import type { IncomingCall } from "@/components/products/huddle-ai/call/CallProvider";

/** WebAudio ringtone — no audio asset. A soft, warm two-tone loop. */
function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;

      const beep = (freq: number, at: number, dur: number) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + at + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + dur + 0.05);
      };
      const loop = () => {
        if (stopped) return;
        beep(1046, 0, 0.28);
        beep(784, 0.34, 0.34);
        timer = setTimeout(loop, 2400);
      };
      loop();
    } catch {
      /* audio unavailable */
    }
    return () => {
      stopped = true;
      clearTimeout(timer);
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, [active]);
}

export default function IncomingCallModal({
  call,
  onAccept,
  onDecline,
}: {
  call: IncomingCall;
  onAccept: () => void;
  onDecline: () => void;
}) {
  useRingtone(true);

  useEffect(() => {
    const t = setTimeout(onDecline, 45_000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDecline();
      if (e.key === "Enter") onAccept();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onDecline, onAccept]);

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/30 p-4 backdrop-blur-[2px] sm:items-center"
      >
        <motion.div
          initial={{ scale: 0.92, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          className="lms-surface w-full max-w-sm overflow-hidden rounded-[28px] border border-border/40 bg-background/95 shadow-2xl backdrop-blur-xl dark:bg-card/95"
        >
          <div className="relative flex flex-col items-center px-6 pb-6 pt-8">
            {/* soft brand glow */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/12 to-transparent" />

            <div className="relative mb-4 flex size-24 items-center justify-center">
              <motion.span
                className="absolute inset-0 rounded-full bg-primary/25"
                animate={{ scale: [1, 1.7], opacity: [0.5, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.span
                className="absolute inset-0 rounded-full bg-primary/20"
                animate={{ scale: [1, 1.7], opacity: [0.5, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.6 }}
              />
              <span className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-2xl font-bold text-white shadow-lg">
                {call.fromName.slice(0, 1).toUpperCase()}
              </span>
            </div>

            <p className="text-lg font-semibold text-foreground">{call.fromName}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              {call.mode === "video" ? <Video className="size-3.5" /> : <Phone className="size-3.5" />}
              Incoming {call.mode} call
              <span className="ml-1 flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="size-1 rounded-full bg-primary"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </span>
            </p>

            <div className="mt-7 flex w-full items-center justify-center gap-10">
              <div className="flex flex-col items-center gap-1.5">
                <motion.button
                  type="button"
                  onClick={onDecline}
                  aria-label="Decline"
                  whileTap={{ scale: 0.92 }}
                  className="flex size-16 items-center justify-center rounded-full bg-destructive text-white shadow-lg shadow-destructive/30 transition-transform hover:scale-105"
                >
                  <PhoneOff className="size-6" />
                </motion.button>
                <span className="text-xs text-muted-foreground">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <motion.button
                  type="button"
                  onClick={onAccept}
                  aria-label="Accept"
                  whileTap={{ scale: 0.92 }}
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  className="flex size-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30 transition-transform hover:scale-105"
                >
                  {call.mode === "video" ? <Video className="size-6" /> : <Phone className="size-6" />}
                </motion.button>
                <span className="text-xs text-muted-foreground">Accept</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
