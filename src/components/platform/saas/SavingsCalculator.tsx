"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock, PiggyBank, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/platform/billing/types";
import type { ShowcasePlan } from "@/lib/platform/billing/showcase";

/**
 * "What would you save?" — the visitor enters what they pay today; the plan for their team size comes from the real catalogue.
 * Every number on the left is the visitor's own; nothing is assumed about their business.
 */
export default function SavingsCalculator({ plans }: { plans: ShowcasePlan[] }) {
  const currency = plans[0]?.currency ?? "INR";
  const [people, setPeople] = useState(10);
  const [tools, setTools] = useState(8);
  const [toolCost, setToolCost] = useState(1000); // per tool, per month, in major units
  const [hours, setHours] = useState(10); // manual admin hours per week

  const plan = useMemo(() => {
    const fits = plans.filter((p) => p.kind !== "contact" && (p.seats === null || p.seats >= people));
    return fits.sort((a, b) => (a.offer.monthly ?? 0) - (b.offer.monthly ?? 0))[0] ?? plans.find((p) => p.kind === "contact") ?? null;
  }, [plans, people]);

  const today = tools * toolCost * 100; // paise
  const ours = plan && plan.kind !== "contact" ? (plan.kind === "free" ? 0 : (plan.offer.monthly ?? 0)) : null;
  const saving = ours === null ? null : Math.max(0, today - ours);

  const field = (label: string, value: number, set: (n: number) => void, min: number, max: number, step: number, suffix: string) => {
    const pct = ((value - min) / (max - min)) * 100;
    return (
      <label className="block">
        <span className="mb-3 flex items-center justify-between gap-3 text-sm font-semibold text-white/90">
          <span>{label}</span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-black text-white ring-1 ring-white/20">{suffix === "₹" ? `₹${value.toLocaleString("en-IN")}` : `${value.toLocaleString("en-IN")} ${suffix}`}</span>
        </span>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="sr-range" style={{ ["--pct" as string]: `${pct}%` }} />
      </label>
    );
  };

  const shown = useAnimated(saving ?? 0);
  const ratio = today > 0 && ours !== null ? Math.max(4, Math.min(100, (ours / today) * 100)) : 100;
  const hoursMonth = Math.round(hours * 4.3);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr] lg:gap-6">
      <div className="sr-glass space-y-8 p-7 sm:p-9">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/70"><Wallet className="h-4 w-4" />Your business today — move the sliders</p>
        {field("People on your team", people, setPeople, 1, 500, 1, "people")}
        {field("Separate software tools you pay for", tools, setTools, 1, 20, 1, "tools")}
        {field("Average cost per tool, per month", toolCost, setToolCost, 0, 20000, 250, currency === "INR" ? "₹" : currency)}
        {field("Hours a week spent on manual admin", hours, setHours, 0, 80, 1, "hours")}
      </div>

      <div className="sr-light relative flex flex-col justify-between gap-7 overflow-hidden rounded-[1.75rem] bg-white p-7 text-foreground shadow-[0_40px_80px_-30px_rgb(0_0_0/.6)] sm:p-9">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-primary/25 to-brand-accent/25 blur-3xl" />
        <div className="relative">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary"><PiggyBank className="h-4 w-4" />Software you stop paying for</p>
          <p className="mt-2 bg-gradient-to-br from-primary to-brand-accent bg-clip-text text-6xl font-black leading-none tracking-tighter text-transparent sm:text-7xl">{saving === null ? "—" : formatMoney(shown, currency)}<span className="ml-1.5 text-xl font-bold tracking-normal text-muted-foreground">/mo</span></p>
        </div>

        <div className="relative space-y-5">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm"><span className="font-semibold text-muted-foreground">You pay for software today</span><span className="font-black">{formatMoney(today, currency)}<span className="text-xs font-medium text-muted-foreground">/mo</span></span></div>
            <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full w-full rounded-full bg-gradient-to-r from-slate-400 to-slate-500" /></div>
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm"><span className="font-semibold">{plan ? `SelfRun ${plan.name} for ${people} ${people === 1 ? "person" : "people"}` : "SelfRun"}</span><span className="font-black text-primary">{ours === null ? "Let's talk" : ours === 0 ? "Free" : formatMoney(ours, currency)}{ours ? <span className="text-xs font-medium text-muted-foreground">/mo</span> : null}</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-brand-accent transition-[width] duration-700" style={{ width: `${ratio}%` }} /></div>
          </div>
        </div>

        <div className="relative flex items-start gap-3 rounded-2xl bg-primary/[0.07] p-4 text-[15px] leading-relaxed">
          <Clock className="mt-0.5 h-5 w-5 flex-none text-primary" />
          <p>Plus <b>{hoursMonth.toLocaleString("en-IN")} hours a month</b> of manual admin your team can hand to automations — reminders, follow-ups, approvals and reports.</p>
        </div>

        <div className="relative">
          <Link href="/signup" className="group inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3.5 text-sm font-bold text-background shadow-xl transition-all hover:scale-105">
            Start saving — free forever <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">Your own estimate. Plan prices are today&apos;s, excluding taxes.</p>
        </div>
      </div>
    </div>
  );
}

/** Eases a displayed number toward its target so the saving glides as the sliders move. */
function useAnimated(target: number) {
  const [v, setV] = useState(target);
  useEffect(() => {
    let raf = 0;
    const from = v;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 500);
      setV(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return v;
}
