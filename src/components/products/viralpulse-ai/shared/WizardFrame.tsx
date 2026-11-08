"use client";

import type { ReactNode, Ref } from "react";
import { ArrowLeft, Check, CloudOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { cn } from "@/lib/utils";

/**
 * The frame every ViralPulse studio wizard shares (AI UGC Studio, AI Image Studio, Generate Image): a gradient surround, the
 * numbered step bar, a card with the step title and the autosave status, and a sticky Back / action bar. Steps (1-based `n`) before
 * the current one show a check and can be clicked to go back.
 */

export interface FrameStep { key: string; n: number; label: string }
export type SaveState = "idle" | "saving" | "saved" | "local" | "error";

export function SaveStatus({ save, msg, localText }: { save: SaveState; msg?: string; localText: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-[11px]", save === "error" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground")} role="status" aria-live="polite">
      {save === "saving" && <><Loader2 className="size-3 animate-spin" /> Saving…</>}
      {save === "saved" && <><Check className="size-3 text-emerald-600" /> Saved as draft</>}
      {save === "local" && <><CloudOff className="size-3" /> {localText}</>}
      {save === "error" && <>{`Not saved${msg ? `: ${msg}` : ""}`}</>}
    </p>
  );
}

export default function WizardFrame({
  steps, step, reached, busy, onGoTo, navLabel = "Progress", title, subtitle, status, banner, headingRef, children, backDisabled, onBack, actions,
}: {
  steps: readonly FrameStep[];
  /** 1-based number of the current step. */
  step: number;
  reached: number;
  busy: boolean;
  onGoTo: (n: number) => void;
  navLabel?: string;
  title: string;
  subtitle: string;
  status?: ReactNode;
  banner?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
  backDisabled: boolean;
  onBack: () => void;
  actions: ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-[1.75rem] bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-1.5 sm:p-2">
      {banner}
      <nav aria-label={navLabel} className="rounded-2xl border border-primary/15 bg-background/90 p-3 shadow-sm backdrop-blur-xl dark:bg-[#080711]/95">
        <ol className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          {steps.map((s, i) => {
            const done = s.n < step || (s.n <= reached && s.n !== step && s.n < step);
            const current = s.n === step;
            const clickable = s.n <= step && !busy;
            return (
              <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1">
                <button
                  type="button"
                  disabled={!clickable}
                  aria-current={current ? "step" : undefined}
                  onClick={() => onGoTo(s.n)}
                  className={cn("flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:px-3", current ? "bg-primary/10 dark:bg-violet-500/15" : clickable ? "hover:bg-muted/60" : "opacity-60")}
                >
                  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", current ? "bg-primary text-primary-foreground" : done ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
                    {done ? <Check className="size-3.5" /> : s.n}
                  </span>
                  <span className={cn("truncate text-xs font-semibold sm:text-sm", current ? "text-primary" : "text-muted-foreground", !current && "max-sm:hidden")}>{s.label}</span>
                </button>
                {i < steps.length - 1 && <span aria-hidden className="h-px min-w-3 flex-1 bg-border dark:bg-white/15" />}
              </li>
            );
          })}
        </ol>
      </nav>

      <GlassCard interactive={false} className="border-primary/15 bg-background/95 shadow-xl dark:bg-[#080711]/95">
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold outline-none">{title}</h2>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
            {status}
          </div>
          {children}
        </CardContent>
      </GlassCard>

      <div className="sticky bottom-0 z-20 -mx-1 flex items-center justify-between gap-2 rounded-2xl border border-primary/15 bg-background/95 p-3 shadow-xl backdrop-blur-xl dark:bg-[#080711]/95">
        <Button type="button" variant="outline" disabled={backDisabled || busy} onClick={onBack}><ArrowLeft className="size-4" /> Back</Button>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}
