"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, ChevronDown, ChevronRight, Clock, Pause, TriangleAlert } from "lucide-react";
import type { CompanyJobState, CompanyJobView } from "@/lib/cron/company-view";

const STATE: Record<CompanyJobState, { label: string; tone: string }> = {
  on_schedule: { label: "On schedule", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  delayed: { label: "Delayed", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  paused: { label: "Paused by SelfRun", tone: "bg-muted text-muted-foreground" },
  not_yet: { label: "Not run yet", tone: "bg-muted text-muted-foreground" },
};
const local = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");
const utc = (iso: string | null) => (iso ? `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC` : "");

/** A read-only list of what runs on its own: when, when it last ran, and what it does. */
export default function ScheduledJobsList({ jobs, products, scheduledAnnouncements }: { jobs: CompanyJobView[]; products: Record<string, string>; scheduledAnnouncements: { id: string; title: string; at: string | null }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const productName = (k: string) => (k === "platform" ? "Platform" : k === "workspace" ? "Workspace" : (products[k] ?? k));
  const delayed = jobs.filter((j) => j.state === "delayed").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4"><p className="text-sm text-muted-foreground">Jobs that run on their own</p><p className="mt-1 text-2xl font-bold tabular-nums">{jobs.length}</p></div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4"><p className="text-sm text-muted-foreground">Running on schedule</p><p className="mt-1 text-2xl font-bold tabular-nums">{jobs.filter((j) => j.state === "on_schedule").length}</p>{delayed > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{delayed} delayed. They run again on their next schedule.</p>}</div>
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4"><p className="text-sm text-muted-foreground">Your scheduled announcements</p><p className="mt-1 text-2xl font-bold tabular-nums">{scheduledAnnouncements.length}</p><Link href="/commandos/settings/notifications" className="text-xs text-primary hover:underline">Manage in the Notification center</Link></div>
      </div>

      {scheduledAnnouncements.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/70 p-4 text-sm">
          <p className="mb-2 flex items-center gap-2 font-medium"><CalendarClock className="size-4 text-primary" /> Announcements waiting to go out</p>
          <ul className="space-y-1">{scheduledAnnouncements.map((a) => <li key={a.id} className="flex flex-wrap justify-between gap-2"><span>{a.title}</span><span className="text-muted-foreground">{local(a.at)}</span></li>)}</ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/70">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">What runs</th><th className="px-3 py-2">When</th><th className="px-3 py-2">Next run</th><th className="px-3 py-2">Last ran</th><th className="px-3 py-2">Status</th></tr></thead>
          <tbody className="divide-y">
            {jobs.map((j) => (
              <JobRow key={j.key} j={j} open={open === j.key} onToggle={() => setOpen(open === j.key ? null : j.key)} productName={productName(j.product)} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground"><Clock className="mt-0.5 size-3.5 shrink-0" /> Jobs marked &ldquo;every company&rdquo; run once for your workspace among the others. SelfRun&apos;s own jobs (billing, domains, app builds) are listed so you know when they check your account. This page is read-only; what each job does for you is changed in the settings it links to.</p>
    </div>
  );
}

function JobRow({ j, open, onToggle, productName }: { j: CompanyJobView; open: boolean; onToggle: () => void; productName: string }) {
  const s = STATE[j.state];
  return (
    <>
      <tr data-job={j.key} className="align-top">
        <td className="px-3 py-3">
          <button type="button" onClick={onToggle} aria-expanded={open} className="flex items-start gap-1.5 text-left">
            {open ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
            <span><span className="block font-medium">{j.name}</span><span className="text-xs text-muted-foreground">{productName} · {j.scope === "each company" ? "every company" : "SelfRun"}</span></span>
          </button>
        </td>
        <td className="px-3 py-3"><span className="block">{j.when}</span>{j.frequent && <span className="text-xs text-muted-foreground">checks very often</span>}</td>
        <td className="px-3 py-3 text-xs">{j.state === "paused" ? <span className="text-muted-foreground">Paused</span> : <><span className="block whitespace-nowrap">{local(j.nextRunAt)}</span><span className="text-muted-foreground">{utc(j.nextRunAt)}</span></>}</td>
        <td className="px-3 py-3 text-xs"><span className="block whitespace-nowrap">{local(j.lastRanAt)}</span><span className="text-muted-foreground">{utc(j.lastRanAt)}</span></td>
        <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.tone}`}>{j.state === "on_schedule" ? <CheckCircle2 className="size-3" /> : j.state === "delayed" ? <TriangleAlert className="size-3" /> : j.state === "paused" ? <Pause className="size-3" /> : null}{s.label}</span></td>
      </tr>
      {open && (
        <tr className="bg-muted/20">
          <td colSpan={5} className="space-y-2 px-4 py-4 text-sm">
            <p>{j.description}</p>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Schedule</dt><dd>{j.when} <code className="text-xs text-muted-foreground">({j.schedule})</code></dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Also runs when</dt><dd>{j.alsoRunsOn ?? "Only on its schedule."}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Change what it does for you</dt><dd>{j.configure ? <Link href={j.configure.href} className="text-primary hover:underline">{j.configure.label}</Link> : "Nothing to set: it works on its own."}</dd></div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}
