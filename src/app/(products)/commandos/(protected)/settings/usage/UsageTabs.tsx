"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, LayoutDashboard, ListChecks, Plus, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type TabId = "overview" | "capacity" | "details" | "people";
const TABS: { id: TabId; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", hint: "Where every service stands", icon: LayoutDashboard },
  { id: "capacity", label: "Add capacity", hint: "Buy more, once", icon: Plus },
  { id: "details", label: "History", hint: "Day by day, every use", icon: ListChecks },
  { id: "people", label: "People", hint: "Who uses what", icon: Users },
];
/** The links inside the usage pieces point at #details, #people and #person: each opens the step it belongs to. */
const FROM_HASH: Record<string, TabId> = { overview: "overview", capacity: "capacity", topups: "capacity", details: "details", history: "details", people: "people", person: "people" };

export interface UsageAlert {
  key: string;
  label: string;
  level: "near" | "over";
  percent: number;
}

/**
 * The Usage page as four steps instead of one long scroll: Overview (a plain verdict, then the meters), Add capacity (buy more), History (the
 * chosen meter day by day) and People (who uses what). The pieces themselves are server-rendered and passed in; this only decides which one
 * shows. Hidden steps stay mounted, so nothing is lost when switching.
 */
export default function UsageTabs({ alerts, planName, overview, capacity, details, people, startOn }: { alerts: UsageAlert[]; planName: string | null; overview: ReactNode; capacity: ReactNode; details: ReactNode; people: ReactNode; startOn: TabId }) {
  const [tab, setTab] = useState<TabId>(startOn);
  const path = usePathname();
  const params = useSearchParams();

  const go = useCallback((id: TabId) => {
    setTab(id);
    try {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
    } catch {
      /* cosmetic */
    }
  }, []);

  // A link inside a piece (a meter, a person) changes the address: follow it to the step it points at.
  useEffect(() => {
    const read = () => {
      const t = FROM_HASH[window.location.hash.replace("#", "")];
      if (t) setTab(t);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [path, params]);

  const over = alerts.filter((a) => a.level === "over");
  const verdict = over.length > 0 ? "over" : alerts.length > 0 ? "near" : "ok";
  const show = (id: TabId): React.CSSProperties | undefined => (tab === id ? undefined : { display: "none" });

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Usage and limits" className="flex gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-card p-1.5">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`usage-${t.id}-tab`} aria-selected={tab === t.id} aria-controls={`usage-${t.id}`} onClick={() => go(t.id)} className={`flex min-w-0 shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-left transition-colors ${tab === t.id ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            <t.icon className="size-4 shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-tight">{t.label}</span>
              <span className={`hidden text-[11px] leading-tight sm:block ${tab === t.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{t.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <section id="usage-overview" role="tabpanel" aria-labelledby="usage-overview-tab" style={show("overview")} className="space-y-4">
        <div role="status" className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${verdict === "over" ? "border-destructive/40 bg-destructive/10" : verdict === "near" ? "border-amber-500/40 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
          <div className="flex min-w-0 items-start gap-3">
            {verdict === "ok" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <AlertTriangle className={`mt-0.5 size-5 shrink-0 ${verdict === "over" ? "text-destructive" : "text-amber-600"}`} />}
            <div className="min-w-0">
              <p className="font-black leading-snug">{verdict === "ok" ? "Everything is within your limits" : verdict === "over" ? `${over.map((a) => a.label).join(", ")}: limit reached` : "You are close to a limit"}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {verdict === "ok"
                  ? `Your ${planName ?? "plan"} allowances reset every month. Nothing needs your attention.`
                  : alerts.map((a) => `${a.label} ${a.level === "over" ? "is used up" : `is ${a.percent}% used`}`).join(" · ") + ". Add capacity once, or move to a bigger plan."}
              </p>
            </div>
          </div>
          {verdict !== "ok" && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => go("capacity")}><Plus className="size-4" /> Add capacity</Button>
              <Link href="/commandos/settings/billing#billing-plans-section" className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3.5 text-sm font-semibold hover:bg-muted">Change plan</Link>
            </div>
          )}
        </div>
        {overview}
      </section>

      <section id="usage-capacity" role="tabpanel" aria-labelledby="usage-capacity-tab" style={show("capacity")}>{capacity}</section>
      <section id="usage-details" role="tabpanel" aria-labelledby="usage-details-tab" style={show("details")}>{details}</section>
      <section id="usage-people" role="tabpanel" aria-labelledby="usage-people-tab" style={show("people")} className="space-y-4">{people}</section>
    </div>
  );
}
