"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Globe, LayoutDashboard, Loader2, LogIn, PanelsTopLeft, Building2, Send, ShieldCheck } from "lucide-react";

interface Step {
  title: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Milliseconds after submit at which this step becomes the active one. */
  at: number;
}

/**
 * Shown in place of the sign-up form while the workspace is being created. The server does the work in one go and
 * redirects when it's done, so the steps are paced by time (they describe what the server is doing, in order) and the
 * ring eases toward — but never reaches — 100% until the page changes. A small workspace sketch fills in as steps finish.
 */
export default function CreatingWorkspace({ companyName, host, approval = false }: { companyName: string; host: string; approval?: boolean }) {
  const reduce = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - started), 120);
    return () => clearInterval(t);
  }, []);

  const steps: Step[] = approval
    ? [
        { title: "Checking your details", detail: "Making sure the address is free", icon: ShieldCheck, at: 0 },
        { title: "Sending your request", detail: "Our team will review it", icon: Send, at: 1500 },
      ]
    : [
        { title: "Creating your business", detail: companyName ? `Setting up ${companyName}` : "Setting up your business record", icon: Building2, at: 0 },
        { title: "Reserving your address", detail: host, icon: Globe, at: 1400 },
        { title: "Preparing your workspace", detail: "Roles, products and your free plan", icon: PanelsTopLeft, at: 3200 },
        { title: "Writing your website with AI", detail: "Pages, menu, colours and photos made for your kind of business", icon: LayoutDashboard, at: 5600 },
        { title: "Signing you in", detail: "Opening your workspace", icon: LogIn, at: 95000 },
      ];

  const active = steps.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);
  // The website step takes the longest (AI writes the pages and makes the photos), so the ring is paced over a minute or two, not a few seconds.
  const percent = Math.min(96, Math.round(96 * (1 - Math.exp(-elapsed / (approval ? 5200 : 40000)))));
  const initial = (companyName.trim()[0] ?? "W").toUpperCase();
  const R = 54;
  const C = 2 * Math.PI * R;

  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }} data-testid="creating-workspace">
      {/* progress ring */}
      <div className="relative mx-auto flex size-40 items-center justify-center">
        <div aria-hidden className="absolute inset-2 rounded-full bg-gradient-to-br from-primary/25 to-brand-accent/25 blur-2xl" />
        <svg viewBox="0 0 128 128" className="absolute inset-0 -rotate-90" role="progressbar" aria-label="Creating your workspace" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <defs>
            <linearGradient id="sr-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--brand-gradient)" />
            </linearGradient>
          </defs>
          <circle cx="64" cy="64" r={R} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
          <motion.circle cx="64" cy="64" r={R} fill="none" stroke="url(#sr-ring)" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} initial={false} animate={{ strokeDashoffset: C * (1 - percent / 100) }} transition={{ duration: 0.45, ease: "easeOut" }} />
        </svg>
        <div className="relative text-center">
          <p className="text-4xl font-black leading-none tracking-tighter tabular-nums">{percent}<span className="text-lg text-muted-foreground">%</span></p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{approval ? "Sending" : "Creating"}</p>
        </div>
      </div>

      <div className="mt-5 text-center">
        <h2 className="text-2xl font-black tracking-tight">{approval ? "Sending your request" : "Creating your workspace"}</h2>
        <p className="mx-auto mt-2 inline-flex max-w-full items-center gap-2 truncate rounded-full border border-border/70 bg-muted/40 px-4 py-1.5 text-sm font-semibold text-muted-foreground">
          <Globe className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{approval ? companyName || "Your business" : host}</span>
        </p>
      </div>

      {/* a workspace sketch that fills in as the steps complete */}
      {!approval && (
        <div className="mx-auto mt-6 max-w-sm overflow-hidden rounded-2xl border border-border/70 bg-background shadow-lg shadow-primary/10" aria-hidden>
          <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-3 py-2">
            <span className="size-2 rounded-full bg-red-400/70" /><span className="size-2 rounded-full bg-amber-400/70" /><span className="size-2 rounded-full bg-emerald-400/70" />
            <span className="ml-2 flex-1 truncate rounded-full bg-background px-3 py-0.5 text-[10px] text-muted-foreground">{active >= 1 ? host : "…"}</span>
          </div>
          <div className="flex h-28">
            <div className="w-1/3 space-y-1.5 border-r border-border/60 bg-muted/30 p-2.5">
              <div className="flex items-center gap-1.5">
                <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-primary to-brand-accent text-[10px] font-black text-white">{initial}</span>
                <span className={`h-1.5 flex-1 rounded-full ${active >= 0 ? "bg-foreground/30" : "bg-muted"}`} />
              </div>
              {[0, 1, 2, 3].map((n) => (
                <motion.span key={n} className="block h-1.5 rounded-full bg-primary/30" initial={false} animate={{ opacity: active >= 2 ? 1 : 0.15, width: active >= 2 ? `${90 - n * 12}%` : "40%" }} transition={{ delay: reduce ? 0 : n * 0.12, duration: 0.4 }} />
              ))}
            </div>
            <div className="flex-1 space-y-2 p-3">
              <motion.span className="block h-2.5 w-1/2 rounded-full bg-foreground/25" initial={false} animate={{ opacity: active >= 0 ? 1 : 0.2 }} />
              <div className="grid grid-cols-3 gap-1.5">
                {[0, 1, 2].map((n) => (
                  <motion.span key={n} className="h-9 rounded-lg bg-gradient-to-br from-primary/20 to-brand-accent/20" initial={false} animate={{ opacity: active >= 2 ? 1 : 0.12, scale: active >= 2 ? 1 : 0.9 }} transition={{ delay: reduce ? 0 : n * 0.1 }} />
                ))}
              </div>
              <motion.span className="block h-6 rounded-lg border border-dashed border-primary/40 bg-primary/5" initial={false} animate={{ opacity: active >= 3 ? 1 : 0.12 }} />
            </div>
          </div>
        </div>
      )}

      {/* steps */}
      <ol className="mt-7 space-y-2" aria-label="Progress">
        {steps.map((s, i) => {
          const state = i < active ? "done" : i === active ? "active" : "todo";
          const StepIcon = s.icon;
          return (
            <li key={s.title} aria-current={state === "active" ? "step" : undefined} className={`flex items-center gap-3.5 rounded-2xl border px-3.5 py-3 transition-all duration-500 ${state === "active" ? "border-primary/40 bg-primary/[0.06] shadow-md shadow-primary/10" : state === "done" ? "border-transparent bg-muted/30" : "border-transparent opacity-45"}`}>
              <span className={`relative flex size-9 shrink-0 items-center justify-center rounded-full transition-all duration-500 ${state === "done" ? "bg-emerald-500 text-white" : state === "active" ? "bg-gradient-to-br from-primary to-brand-accent text-white shadow-lg shadow-primary/30" : "bg-muted text-muted-foreground"}`}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={state} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.2 }} className="flex">
                    {state === "done" ? <Check className="size-[18px]" strokeWidth={3} /> : state === "active" ? <Loader2 className="size-[18px] animate-spin" /> : <StepIcon className="size-[18px]" />}
                  </motion.span>
                </AnimatePresence>
                {state === "active" && !reduce && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-primary/30" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold leading-tight">{s.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.detail}</span>
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{state === "done" ? "Done" : state === "active" ? "Now" : `${i + 1}/${steps.length}`}</span>
            </li>
          );
        })}
      </ol>

      <p className="mt-5 text-center text-xs text-muted-foreground" role="status" aria-live="polite">
        {steps[active]?.title}… This usually takes a few seconds — please keep this tab open.
      </p>
    </motion.div>
  );
}
