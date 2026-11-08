"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Dices, Pause, Play, Camera, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, PhoneFrame } from "@/components/products/viralpulse-ai/ugc/UgcBits";
import { DRIFT_KEYFRAMES, SceneArt, useReducedMotion, useStoryboard } from "@/components/products/viralpulse-ai/ugc/StyleIllustration";
import { stepMs } from "@/lib/products/viralpulse-ai/ugc/styles/preview";
import type { UgcStyle } from "@/lib/products/viralpulse-ai/ugc/styles";
import { cn } from "@/lib/utils";

/**
 * The storyboard player: the style's beats, one after another, drawn from the catalogue (no AI call, no photos). Autoplays and loops unless
 * the person prefers reduced motion; always has Previous / Pause / Next and a clickable beat strip. "Another look" changes the cast, room
 * and light so two videos of the same style can be compared.
 */
export default function StoryboardPlayer({ style, seedN, onSeedChange, autoPlay = true, className }: { style: UgcStyle; seedN: number; onSeedChange: (n: number) => void; autoPlay?: boolean; className?: string }) {
  const board = useStoryboard(style, seedN);
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [wantPlay, setWantPlay] = useState(autoPlay);
  const [hidden, setHidden] = useState(false);
  const playing = wantPlay && !reduced && !hidden;
  const n = board.scenes.length;
  const scene = board.scenes[Math.min(idx, n - 1)];
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setIdx((i) => (i + 1) % n), stepMs(scene.durationSecs));
    return () => window.clearTimeout(t);
  }, [playing, idx, n, scene.durationSecs]);

  const go = useCallback((i: number) => setIdx(((i % n) + n) % n), [n]);
  const manual = (i: number) => { setWantPlay(false); go(i); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); manual(idx + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); manual(idx - 1); }
  };

  return (
    <div ref={root} className={cn("space-y-3", className)} role="group" aria-roledescription="storyboard" aria-label={`Storyboard preview of ${style.label}`} onKeyDown={onKey}>
      <style>{DRIFT_KEYFRAMES}</style>
      <PhoneFrame aspect={board.aspect}>
        <div key={`${seedN}-${scene.index}`} className="absolute inset-0 animate-in fade-in duration-300 motion-reduce:animate-none">
          <SceneArt board={board} scene={scene} drift={playing} className="absolute inset-0 size-full" />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-2">
          <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">{`${scene.roleLabel} · ${scene.index + 1}/${n}`}</span>
          <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white tabular-nums">{`${scene.durationSecs}s`}</span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2">
          <p className="mx-auto w-fit max-w-full rounded-md bg-black/65 px-2 py-1 text-center text-[11px] leading-snug font-semibold text-white">{scene.subtitle}</p>
        </div>
        <span className="pointer-events-none absolute bottom-10 left-2 rounded bg-white/85 px-1.5 py-0.5 text-[9px] font-bold text-neutral-800">Illustration</span>
      </PhoneFrame>

      {/* beat strip: also the progress indicator */}
      <ol className="flex gap-1.5" aria-label="Beats">
        {board.scenes.map((s, i) => (
          <li key={i} className="min-w-0 flex-1">
            <button type="button" onClick={() => manual(i)} aria-label={`Go to ${s.roleLabel}, beat ${i + 1} of ${n}`} aria-current={i === idx ? "step" : undefined} className="group block w-full text-left outline-none">
              <span className="block h-1.5 overflow-hidden rounded-full bg-muted group-focus-visible:ring-2 group-focus-visible:ring-primary/50">
                <span
                  key={`${i === idx}-${seedN}-${playing}`}
                  className={cn("block h-full rounded-full bg-primary", i < idx ? "w-full" : i === idx && !playing ? "w-full opacity-60" : i === idx ? "w-0" : "w-0")}
                  style={i === idx && playing ? { animation: `ugc-fill ${stepMs(s.durationSecs)}ms linear forwards` } : undefined}
                />
              </span>
              <span className={cn("mt-1 block truncate text-[10px] font-semibold uppercase", i === idx ? "text-foreground" : "text-muted-foreground")}>{s.roleLabel}</span>
            </button>
          </li>
        ))}
      </ol>
      <style>{"@keyframes ugc-fill{from{width:0}to{width:100%}}"}</style>

      <div className="space-y-1.5" aria-live="polite" aria-atomic="true">
        <p className="text-xs font-semibold">{`${scene.roleLabel}: ${scene.caption}`}</p>
        <p className="text-[11px] text-muted-foreground">{`${scene.speaker} says: ${scene.subtitle}`}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip title="How this beat is filmed"><Camera className="size-3" />{scene.cameraNote}</Chip>
        <Chip><Clock className="size-3" />{`${board.totalSecs}s of beats`}</Chip>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="icon-sm" variant="outline" onClick={() => manual(idx - 1)} aria-label="Previous beat"><ChevronLeft className="size-4" /></Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setWantPlay((p) => !p)} disabled={reduced} aria-pressed={playing} title={reduced ? "Autoplay is off because your system prefers reduced motion" : undefined}>
          {playing ? <><Pause className="size-3.5" /> Pause</> : <><Play className="size-3.5" /> Play</>}
        </Button>
        <Button type="button" size="icon-sm" variant="outline" onClick={() => manual(idx + 1)} aria-label="Next beat"><ChevronRight className="size-4" /></Button>
        <Button type="button" size="sm" variant="secondary" className="ml-auto" onClick={() => { onSeedChange(seedN + 1); setIdx(0); }}><Dices className="size-3.5" /> Another look</Button>
      </div>

      <dl className="grid gap-x-3 gap-y-0.5 rounded-xl bg-muted/40 p-2.5 text-[11px] sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold text-muted-foreground">Look {seedN}</dt>
        <dd>{`${board.settingLabel}, ${board.timeOfDay}`}</dd>
        <dt className="font-semibold text-muted-foreground">Light</dt>
        <dd>{board.lightingLabel}</dd>
        <dt className="font-semibold text-muted-foreground">Cast</dt>
        <dd>{board.cast.join("; ")}</dd>
      </dl>
      <p className="text-[11px] text-muted-foreground">A storyboard drawn from this style&apos;s settings. The people are abstract stand-ins, not real, and the subtitle lines show where your script goes.</p>
    </div>
  );
}
