"use client";

import { useEffect, useState } from "react";
import { SceneArt, useReducedMotion, useStoryboard, DRIFT_KEYFRAMES } from "@/components/products/viralpulse-ai/ugc/StyleIllustration";
import type { UgcStyle } from "@/lib/products/viralpulse-ai/ugc/styles";
import { cn } from "@/lib/utils";

const BOX: Record<string, string> = { "9:16": "w-[3.9rem] aspect-[9/16]", "1:1": "w-[5.2rem] aspect-square", "16:9": "w-[7.4rem] aspect-video" };

/** A small storyboard thumbnail for a gallery card: the first beat, still; it steps through the beats while the card is hovered or focused. */
export default function StyleThumb({ style, active, seedN = 1, className }: { style: UgcStyle; active: boolean; seedN?: number; className?: string }) {
  const board = useStoryboard(style, seedN);
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const n = board.scenes.length;
  useEffect(() => {
    if (!active || reduced) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % n), 1100);
    return () => window.clearInterval(t);
  }, [active, reduced, n]);
  const scene = board.scenes[active && !reduced ? Math.min(idx, n - 1) : 0];
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-lg border border-border/50 bg-muted", BOX[board.aspect] ?? BOX["9:16"], className)}>
      <style>{DRIFT_KEYFRAMES}</style>
      <SceneArt board={board} scene={scene} className="absolute inset-0 size-full" />
      <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-px text-center text-[8px] font-bold tracking-wide text-white uppercase">{scene.roleLabel}</span>
    </div>
  );
}
