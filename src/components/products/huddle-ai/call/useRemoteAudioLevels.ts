"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Watches a set of remote MediaStreams and reports which peers are currently
 * speaking (RMS over an AnalyserNode). Keyed by peerId. Local speaking is
 * handled by `useCallMedia`.
 */
export function useRemoteAudioLevels(streams: Map<string, MediaStream>): Set<string> {
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<Map<string, { analyser: AnalyserNode; src: MediaStreamAudioSourceNode; quiet: number }>>(new Map());
  const rafRef = useRef<number | null>(null);
  const streamsRef = useRef(streams);

  useEffect(() => {
    streamsRef.current = streams;
  }, [streams]);

  useEffect(() => {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    ctxRef.current = ctx;
    const buf = new Uint8Array(256);

    const tick = () => {
      const active = streamsRef.current;
      // add analysers for new streams
      for (const [peerId, stream] of active) {
        const track = stream.getAudioTracks()[0];
        if (!track) continue;
        if (!nodesRef.current.has(peerId)) {
          try {
            const src = ctx.createMediaStreamSource(new MediaStream([track]));
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            src.connect(analyser);
            nodesRef.current.set(peerId, { analyser, src, quiet: 0 });
          } catch {
            /* ignore */
          }
        }
      }
      // drop gone
      for (const peerId of [...nodesRef.current.keys()]) {
        if (!active.has(peerId)) {
          try {
            nodesRef.current.get(peerId)?.src.disconnect();
          } catch {
            /* ignore */
          }
          nodesRef.current.delete(peerId);
        }
      }

      const next = new Set<string>();
      for (const [peerId, node] of nodesRef.current) {
        node.analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        if (rms > 0.045) {
          node.quiet = 0;
          next.add(peerId);
        } else if (++node.quiet < 12) {
          next.add(peerId);
        }
      }
      setSpeaking((prev) => {
        if (prev.size === next.size && [...prev].every((p) => next.has(p))) return prev;
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const nodes = nodesRef.current;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      nodes.forEach((n) => {
        try {
          n.src.disconnect();
        } catch {
          /* ignore */
        }
      });
      nodes.clear();
      ctx.close().catch(() => {});
    };
  }, []);

  return speaking;
}
