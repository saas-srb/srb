"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";

/** The workflow as a stepper: click a step (or use the arrows) and it plays through on its own until you take over. */
export default function StepperHowItWorks({ steps }: { steps: { title: string; text: string }[] }) {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto || steps.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % steps.length), 5500);
    return () => window.clearInterval(t);
  }, [auto, steps.length]);
  const go = (n: number) => { setAuto(false); setI((n + steps.length) % steps.length); };
  const pct = steps.length > 1 ? (i / (steps.length - 1)) * 100 : 100;

  return (
    <div>
      <div className="relative">
        <div className="absolute top-5 h-1 rounded-full bg-border/70" style={{ left: `${50 / steps.length}%`, right: `${50 / steps.length}%` }} aria-hidden />
        <motion.div className="absolute top-5 h-1 rounded-full bg-gradient-to-r from-primary to-brand-accent" style={{ left: `${50 / steps.length}%` }} animate={{ width: `${(100 - 100 / steps.length) * (pct / 100)}%` }} transition={{ duration: 0.5, ease: "easeOut" }} aria-hidden />
        <ol className="relative flex justify-between gap-2" role="tablist" aria-label="Steps">
          {steps.map((s, n) => (
            <li key={s.title} className="flex min-w-0 flex-1 justify-center text-center">
              <button type="button" role="tab" aria-selected={i === n} onClick={() => go(n)} className="group flex flex-col items-center gap-2 outline-none">
                <span className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-black transition-all ${n <= i ? "bg-gradient-to-br from-primary to-brand-accent text-white shadow-lg shadow-primary/30" : "border-2 border-border bg-background text-muted-foreground group-hover:border-primary/50"} ${n === i ? "scale-125 ring-4 ring-primary/20" : ""}`}>{n + 1}</span>
                <span className={`hidden text-sm font-bold leading-tight sm:block ${n === i ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="relative mt-8 overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-card to-primary/[0.06] p-7 sm:p-10">
        <span className="pointer-events-none absolute -right-4 -top-8 select-none bg-gradient-to-b from-primary/25 to-transparent bg-clip-text text-[9rem] font-black leading-none text-transparent sm:text-[12rem]" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.28 }} className="relative max-w-2xl" role="tabpanel" aria-live="polite">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Step {i + 1} of {steps.length}</p>
            <h3 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">{steps[i].title}</h3>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{steps[i].text}</p>
          </motion.div>
        </AnimatePresence>
        <div className="relative mt-8 flex items-center gap-3">
          <button type="button" onClick={() => go(i - 1)} aria-label="Previous step" className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background transition-colors hover:border-primary hover:text-primary"><ArrowLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => go(i + 1)} className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-6 text-sm font-bold text-background transition-transform hover:scale-105">{i === steps.length - 1 ? "Start again" : "Next step"}<ArrowRight className="h-4 w-4" /></button>
          <button type="button" onClick={() => setAuto((a) => !a)} aria-label={auto ? "Pause the tour" : "Play the tour"} className="ml-auto flex h-11 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">{auto ? <><Pause className="h-4 w-4" />Pause</> : <><Play className="h-4 w-4" />Play</>}</button>
        </div>
      </div>
    </div>
  );
}
