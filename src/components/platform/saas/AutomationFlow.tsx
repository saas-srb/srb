"use client";

import { useEffect, useState } from "react";
import { Check, Filter, Play, RotateCcw, Zap } from "lucide-react";
import type { Flow } from "@/lib/platform/saas/site";

/**
 * Trigger → Condition → Action, as the product's workflow builder models it, on a dark canvas. Pick an example and run it:
 * a pulse travels along the connectors, each step lights up in order and the actions tick off one by one.
 */
export default function AutomationFlow({ flows }: { flows: Flow[] }) {
  const [id, setId] = useState(flows[0]?.id);
  const [step, setStep] = useState(-1); // 0 trigger, 1 condition, 2.. actions
  const flow = flows.find((f) => f.id === id) ?? flows[0];
  const last = flow ? 2 + flow.action.length : 2;

  useEffect(() => {
    if (step < 0) return;
    if (step > last) {
      const t = setTimeout(() => setStep(-2), 2600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 800 : 700);
    return () => clearTimeout(t);
  }, [step, last]);

  if (!flow) return null;
  const running = step >= 0 && step <= last;
  const done = step > last || step === -2;
  const lit = (n: number) => (done ? true : step >= n);

  const node = (n: number, label: string, I: typeof Zap, children: React.ReactNode) => (
    <div className={`relative flex-1 rounded-3xl border p-5 transition-all duration-500 ${lit(n) ? "border-white/60 bg-white/20 shadow-[0_0_0_6px_rgb(255_255_255/.08),0_20px_50px_-12px_rgb(0_0_0/.5)]" : "border-white/15 bg-white/[0.06]"}`} style={{ transform: lit(n) && !done ? "translateY(-4px)" : undefined }}>
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/80"><span className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${lit(n) ? "bg-white text-[var(--primary)]" : "bg-white/15 text-white"}`}><I className="h-3.5 w-3.5" /></span>{label}</span>
        <span className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-500 ${lit(n) ? "scale-100 bg-emerald-400 text-emerald-950" : "scale-50 bg-white/10 text-transparent"}`}><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
      </div>
      {children}
    </div>
  );
  const wire = (n: number) => (
    <div className="relative mx-auto h-8 w-[3px] flex-none overflow-hidden rounded-full bg-white/15 md:h-[3px] md:w-12 lg:w-16" aria-hidden>
      <span className={`absolute inset-0 origin-top rounded-full bg-gradient-to-b from-white to-white/60 transition-transform duration-700 md:origin-left md:bg-gradient-to-r ${lit(n) ? "scale-100" : "scale-0"}`} />
    </div>
  );

  return (
    <div className="sr-band min-w-0 max-w-full rounded-[2rem] p-5 shadow-2xl shadow-primary/30 sm:p-8">
      <div className="relative min-w-0">
        <div className="sr-scroll-x mb-6 flex gap-2" role="tablist" aria-label="Example automations">
          {flows.map((f) => (
            <button key={f.id} role="tab" aria-selected={f.id === flow.id} onClick={() => { setId(f.id); setStep(-1); }} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-all ${f.id === flow.id ? "border-transparent bg-white text-black shadow-lg" : "border-white/20 bg-white/10 text-white hover:bg-white/20"}`}>{f.area}</button>
          ))}
        </div>
        <div className="flex flex-col items-stretch md:flex-row md:items-center">
          {node(0, "When", Zap, <p className="text-[17px] font-semibold leading-snug">{flow.trigger}</p>)}
          {wire(1)}
          {node(1, "Rule", Filter, <p className="text-[17px] font-semibold leading-snug">{flow.condition}</p>)}
          {wire(2)}
          {node(2, "Then", Play,
            <ul className="space-y-2.5">
              {flow.action.map((a, k) => (
                <li key={a} className="flex items-start gap-2.5 text-[15px] font-medium leading-snug">
                  <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full transition-all duration-500 ${step >= 3 + k || done ? "bg-emerald-400 text-emerald-950" : "bg-white/15 text-transparent"}`}><Check className="h-3 w-3" strokeWidth={3} /></span>
                  <span className={step >= 3 + k || done ? "" : "text-white/80"}>{a}</span>
                </li>
              ))}
            </ul>,
          )}
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => setStep(0)} disabled={running} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-black shadow-xl transition-transform hover:scale-105 disabled:opacity-80">
            {done ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            {running ? "Running…" : done ? "Run again" : "Run this automation"}
          </button>
          <p className="text-sm text-white/70">{running ? "Each step fires in order." : done ? "Every step ran and was logged." : "See the steps fire, one after another."}</p>
        </div>
      </div>
    </div>
  );
}
