"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Compass, Rocket, Settings2, Workflow } from "lucide-react";

const AGENDA = [
  {
    id: "discover",
    label: "Discover",
    icon: Compass,
    title: "Understand your business in 10 minutes",
    copy: "We start by mapping one real process — a hire, a deal, a project, or a support request. You describe how it works today; we identify exactly which SelfRun products cover it and where AI can remove the manual steps.",
    points: [
      "Pick one process: HR onboarding, sales pipeline, project delivery, or finance approvals",
      "Map the people, handoffs, and data involved",
      "Identify bottlenecks and repeated manual work",
      "Match each step to the right SelfRun product",
    ],
  },
  {
    id: "explore",
    label: "Live walkthrough",
    icon: Workflow,
    title: "See your workflow running live",
    copy: "We open the real product — not slides — and walk the process end to end. You see CRM, HR, Projects, Finance, and AI working as one connected system: a lead becomes a client, a client triggers a project, a project triggers payroll.",
    points: [
      "CRM pipeline → client onboarding → project kick-off",
      "HR: offer letter, onboarding checklist, payroll in one flow",
      "AI Assistants answering questions from your own business data",
      "Approvals, role permissions, and audit trail in action",
    ],
  },
  {
    id: "setup",
    label: "Setup plan",
    icon: Settings2,
    title: "Leave with a ready-to-run setup plan",
    copy: "In the last 10 minutes we outline exactly what a Day 1 setup looks like for your team: which products to switch on, how many seats you need, what to migrate first, and what the first week looks like.",
    points: [
      "Recommended products and plan tier for your team size",
      "Data migration path: contacts, employees, documents",
      "Invite order — who gets access first and why",
      "Go-live checklist you can action the same day",
    ],
  },
  {
    id: "next",
    label: "Next steps",
    icon: Rocket,
    title: "Start free — no commitment needed",
    copy: "Every product is included in the free plan. You can sign up, invite your team, and run a real process before spending a rupee. If you want a deeper evaluation, we'll set up a private sandbox with your own data.",
    points: [
      "Free plan includes every product — no trial expiry",
      "Upgrade only when your team grows or you need more AI tokens",
      "Private sandbox with your data available on request",
      "Dedicated onboarding call for Growth plan and above",
    ],
  },
  {
    id: "learn",
    label: "Resources",
    icon: BookOpen,
    title: "Everything you need to evaluate SelfRun",
    copy: "Docs, guides, and a self-guided product tour are available right now — no booking required. Every feature has a step-by-step guide written for the person who will actually use it, not just the decision-maker.",
    points: [
      "Interactive product tour with shared demo credentials",
      "Step-by-step guides for every feature in every product",
      "Architecture and security overview for your IT team",
      "Pricing calculator with real provider costs broken down",
    ],
  },
];

export default function DemoAgenda() {
  const [activeId, setActiveId] = useState(AGENDA[0].id);
  const activeIndex = AGENDA.findIndex((item) => item.id === activeId);
  const active = AGENDA[activeIndex] ?? AGENDA[0];
  const ActiveIcon = active.icon;
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < AGENDA.length - 1;
  const goTo = (i: number) => setActiveId(AGENDA[i].id);
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-border/60 bg-card shadow-sm">
      <div className="border-b border-border/50 bg-gradient-to-br from-primary/[0.08] via-transparent to-brand-accent/[0.08] p-5 sm:p-7">
        <p className="sr-eyebrow">Your 30-minute walkthrough</p>
        <h3 className="mt-2 text-xl font-black">Choose a step to preview</h3>
        <div className="mt-5 grid grid-cols-5 gap-2" role="tablist" aria-label="Guided demo agenda">
          {AGENDA.map((item, index) => {
            const Icon = item.icon;
            const selected = item.id === activeId;
            return (
              <button
                key={item.id}
                id={`agenda-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="agenda-panel"
                onClick={() => setActiveId(item.id)}
                className={`flex min-h-16 flex-col items-start justify-center gap-1.5 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all active:scale-[0.98] ${selected ? "border-primary bg-primary text-white shadow-md shadow-primary/20" : "border-border/60 bg-background hover:border-primary/40 hover:shadow-sm"}`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${selected ? "bg-white/15" : "bg-muted"}`}>
                  {selected ? <Icon className="h-3.5 w-3.5" /> : `0${index + 1}`}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div id="agenda-panel" role="tabpanel" aria-labelledby={`agenda-tab-${active.id}`} className="flex flex-1 flex-col p-5 sm:p-7">
        <div key={active.id} className="flex flex-1 flex-col" style={{ animation: "sr-in .35s ease both" }}>
          <div className="flex items-start gap-4">
            <span className="sr-icon h-12 w-12 shrink-0"><ActiveIcon className="h-5 w-5" /></span>
            <div>
              <p className="sr-eyebrow">Step 0{activeIndex + 1}</p>
              <h4 className="mt-1 text-xl font-black">{active.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{active.copy}</p>
            </div>
          </div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {active.points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-muted/20 p-3 text-sm transition-colors hover:border-primary/30 hover:bg-primary/[0.04]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {point}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-border/50 pt-5">
            <button
              type="button"
              onClick={() => goTo(activeIndex - 1)}
              disabled={!hasPrev}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-4 py-2 text-sm font-semibold transition-all hover:border-primary/40 hover:text-primary disabled:pointer-events-none disabled:opacity-30"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={() => goTo(activeIndex + 1)}
              disabled={!hasNext}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-30"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
