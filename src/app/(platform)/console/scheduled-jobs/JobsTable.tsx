"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, CheckCircle2, ChevronDown, ChevronRight, Clock, Loader2, Pause, Play, RotateCcw, Save, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobHealth, JobView, RunView } from "@/lib/cron/status";
import { Input } from "@/components/ui/input";
import { describeCron, intervalMs, isValidCron, nextRun } from "@/lib/cron/schedule";
import { jobHistoryAction, resetJobSettingsAction, runJobNowAction, saveAlertEmailsAction, saveJobSettingsAction, setJobEnabledAction } from "./actions";

const HEALTH: Record<JobHealth, { label: string; tone: string }> = {
  healthy: { label: "Healthy", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  running: { label: "Running", tone: "bg-primary/15 text-primary" },
  waiting: { label: "Waiting for first run", tone: "bg-muted text-muted-foreground" },
  overdue: { label: "Overdue", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  failing: { label: "Failing", tone: "bg-destructive/15 text-destructive" },
  paused: { label: "Paused", tone: "bg-muted text-muted-foreground" },
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");
const dur = (ms: number | null) => (ms == null ? "—" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

export default function JobsTable({ jobs, products, mode, canRun, alerts }: { jobs: JobView[]; products: Record<string, string>; mode: { mode: "vercel" | "in-app" | "none"; label: string; cronSecretSet: boolean; cronSecretOnVercel: boolean }; canRun: boolean; alerts: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, RunView[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [enabledNow, setEnabledNow] = useState<Record<string, boolean>>({});
  const isOn = (j: JobView) => enabledNow[j.key] ?? j.enabled;
  // Once the page has the saved state back, the optimistic overrides are no longer needed (and must not hide a later change made elsewhere).
  useEffect(() => setEnabledNow({}), [jobs]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [, start] = useTransition();
  const problems = jobs.filter((j) => j.health === "failing" || j.health === "overdue");
  const paused = jobs.filter((j) => !j.enabled).length;
  const productName = (k: string) => (k === "platform" ? "Platform" : k === "workspace" ? "Workspace" : (products[k] ?? k));

  const toggle = (key: string) => {
    const next = open === key ? null : key;
    setOpen(next);
    if (next && !history[next]) void jobHistoryAction(next).then((rows) => setHistory((h) => ({ ...h, [next]: rows }))).catch(() => setHistory((h) => ({ ...h, [next]: [] })));
  };
  const setEnabled = (job: JobView, enabled: boolean) => {
    if (!enabled && !confirm(`Pause "${job.name}"? It will be skipped whenever its schedule fires, for every company, until you turn it back on. You can still run it by hand.`)) return;
    setSwitching(job.key);
    setMessage(null);
    setEnabledNow((m) => ({ ...m, [job.key]: enabled }));
    start(async () => {
      const res = await setJobEnabledAction(job.key, enabled).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Could not save." }));
      setSwitching(null);
      if (res.ok) {
        setMessage({ ok: true, text: `${job.name} is now ${enabled ? "enabled" : "paused"}.` });
        router.refresh();
      } else {
        setEnabledNow((m) => ({ ...m, [job.key]: !enabled }));
        setMessage({ ok: false, text: `${job.name}: ${res.error}` });
      }
    });
  };
  const run = (job: JobView) => {
    if (!confirm(`Run "${job.name}" now? It does what it does on schedule${job.scope === "each company" ? ", for every company" : ""}.`)) return;
    setBusy(job.key);
    setMessage(null);
    start(async () => {
      const res = await runJobNowAction(job.key).catch((e: unknown) => ({ ok: false, skipped: false, summary: "", error: e instanceof Error ? e.message : "Could not run." }));
      setBusy(null);
      setMessage({ ok: res.ok, text: res.ok ? `${job.name}: ${res.skipped ? res.summary : `done. ${res.summary}`}` : `${job.name} failed: ${res.error}` });
      setHistory((h) => { const { [job.key]: _drop, ...rest } = h; return rest; });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${mode.mode === "none" || (mode.mode === "vercel" && !mode.cronSecretOnVercel) ? "border-amber-500/40 bg-amber-500/10" : "border-border/60 bg-card/70"}`}>
        {mode.mode === "none" || (mode.mode === "vercel" && !mode.cronSecretOnVercel) ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <Clock className="mt-0.5 size-4 shrink-0 text-primary" />}
        <div className="space-y-1">
          <p><span className="font-medium">Started by:</span> {mode.label}.</p>
          {mode.mode === "vercel" && !mode.cronSecretOnVercel && <p className="text-amber-800 dark:text-amber-200">Vercel Cron sends the CRON_SECRET environment variable of the Vercel project, and it is not set there, so Vercel Cron calls are refused. Set it to the same value as the cron secret in Integrations (Vercel cannot read this page), then redeploy.</p>}
          {mode.mode !== "vercel" && !mode.cronSecretSet && <p className="text-muted-foreground">No cron secret is saved (Integrations → Scheduled jobs). The in-app scheduler and Run now do not need one; a scheduler that calls the job URLs does.</p>}
          {mode.mode === "none" && <p className="text-amber-800 dark:text-amber-200">On a server without Vercel Cron, set RUN_SCHEDULER=1 on one instance (see the AWS deployment guide), or call each job&apos;s URL from your own scheduler. You can still run any job below.</p>}
          <p className="text-muted-foreground">{jobs.length} jobs · {problems.length === 0 ? "none need attention" : `${problems.length} need attention`}{paused > 0 ? ` · ${paused} paused` : ""}</p>
        </div>
      </div>
      <AlertRecipients initial={alerts} canEdit={canRun} />
      {message && <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${message.ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-destructive/40 bg-destructive/5 text-destructive"}`}>{message.text}</p>}

      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card/70">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Job</th><th className="px-3 py-2">Schedule (UTC)</th><th className="px-3 py-2">Next run</th><th className="px-3 py-2">Last run</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-center">Enabled</th><th className="px-3 py-2 text-right">24 h</th>{canRun && <th className="px-3 py-2" />}</tr></thead>
          <tbody className="divide-y">
            {jobs.map((j) => (
              <Fragment key={j.key}>
                <tr data-job={j.key} className={`align-top ${isOn(j) ? "" : "opacity-70"}`}>
                  <td className="px-3 py-3">
                    <button type="button" onClick={() => toggle(j.key)} aria-expanded={open === j.key} className="flex items-start gap-1.5 text-left">
                      {open === j.key ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
                      <span><span className="block font-medium">{j.name}</span><span className="text-xs text-muted-foreground">{productName(j.product)} · {j.scope === "each company" ? "every company" : "platform"}</span></span>
                    </button>
                  </td>
                  <td className="px-3 py-3"><span className="block">{j.when}</span><code className="text-xs text-muted-foreground">{j.effectiveSchedule}</code>{j.overridden && <span className="mt-0.5 block text-xs text-primary">Changed from the default ({j.schedule})</span>}{j.frequent && <span className="mt-0.5 block text-xs text-amber-700 dark:text-amber-300">Needs Vercel Pro (more than daily)</span>}{j.note && <span className="mt-0.5 block text-xs text-muted-foreground">{j.note}</span>}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">{when(j.nextRunAt)}</td>
                  <td className="px-3 py-3 text-xs">{j.last ? <><span className="block whitespace-nowrap">{when(j.last.startedAt)}</span><span className="text-muted-foreground">{j.last.trigger} · {dur(j.last.durationMs)}</span></> : <span className="text-muted-foreground">Never</span>}</td>
                  <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${HEALTH[j.health].tone}`}>{j.health === "healthy" ? <CheckCircle2 className="size-3" /> : j.health === "failing" ? <XCircle className="size-3" /> : j.health === "overdue" ? <AlertTriangle className="size-3" /> : null}{HEALTH[j.health].label}</span><span className="mt-0.5 block max-w-56 text-xs text-muted-foreground">{j.healthNote}</span></td>
                  <td className="px-3 py-3 text-center">
                    <button type="button" role="switch" aria-checked={isOn(j)} aria-label={`${isOn(j) ? "Pause" : "Enable"} ${j.name}`} disabled={!canRun || switching === j.key} onClick={() => setEnabled(j, !isOn(j))} title={canRun ? (isOn(j) ? "Enabled: click to pause" : "Paused: click to enable") : "You can view but not change jobs"} className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isOn(j) ? "bg-primary" : "bg-muted-foreground/30"}`}>
                      <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${isOn(j) ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">{isOn(j) ? "On" : "Paused"}</span>
                  </td>
                  <td className="px-3 py-3 text-right text-xs tabular-nums">{j.runs24h}{j.failures24h > 0 && <span className="text-destructive"> · {j.failures24h} failed</span>}</td>
                  {canRun && <td className="px-3 py-3 text-right">{busy === j.key ? <Loader2 className="ml-auto size-4 animate-spin" /> : <Button type="button" size="sm" variant="outline" onClick={() => run(j)} disabled={busy !== null}><Play className="size-3.5" /> Run now</Button>}</td>}
                </tr>
                {open === j.key && (
                  <tr className="bg-muted/20">
                    <td colSpan={canRun ? 8 : 7} className="space-y-3 px-4 py-4">
                      <p className="text-sm">{j.description}</p>
                      <dl className="grid gap-3 text-sm sm:grid-cols-3">
                        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Runs</dt><dd>{j.scope === "each company" ? "Once for every active company" : "Once for the platform"}; stops after {j.maxDurationSec} s</dd></div>
                        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">URL</dt><dd><code className="break-all text-xs">{j.path}</code> <span className="text-muted-foreground">(Authorization: Bearer CRON_SECRET)</span></dd></div>
                        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Also runs when</dt><dd>{j.alsoRunsOn ?? "Only on its schedule."}</dd></div>
                      </dl>
                      <Configure key={`${j.key}:${j.enabled}:${j.effectiveSchedule}:${j.note}`} job={j} canEdit={canRun} mode={mode.mode} />
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent runs</p>
                        {!history[j.key] ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : history[j.key].length === 0 ? <p className="text-sm text-muted-foreground">No runs recorded yet.</p> : (
                          <table className="w-full text-xs">
                            <thead className="text-left text-muted-foreground"><tr><th className="py-1 pr-3">Started</th><th className="pr-3">Started by</th><th className="pr-3">Result</th><th className="pr-3">Took</th><th>What it did</th></tr></thead>
                            <tbody className="divide-y">
                              {history[j.key].map((r) => (
                                <tr key={r.id}>
                                  <td className="whitespace-nowrap py-1 pr-3">{when(r.startedAt)}</td>
                                  <td className="pr-3">{r.trigger}{r.by ? ` · ${r.by}` : ""}</td>
                                  <td className={`pr-3 ${r.status === "failed" ? "text-destructive" : r.status === "ok" ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{r.status}</td>
                                  <td className="pr-3">{dur(r.durationMs)}</td>
                                  <td className="max-w-md truncate" title={r.error || r.summary}>{r.error || r.summary || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PRESETS: { label: string; schedule: string | null }[] = [
  { label: "Default", schedule: null },
  { label: "Every 5 minutes", schedule: "*/5 * * * *" },
  { label: "Every hour", schedule: "0 * * * *" },
  { label: "Daily 02:00", schedule: "0 2 * * *" },
  { label: "Weekly, Monday 03:00", schedule: "0 3 * * 1" },
  { label: "Monthly, 1st 03:00", schedule: "0 3 1 * *" },
];

/** Pause a job, change its schedule, see when it will run next. */
function Configure({ job, canEdit, mode }: { job: JobView; canEdit: boolean; mode: "vercel" | "in-app" | "none" }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(job.enabled);
  const [schedule, setSchedule] = useState(job.overridden ? job.effectiveSchedule : "");
  const [note, setNote] = useState(job.note);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const shown = schedule.trim() || job.schedule;
  const valid = isValidCron(shown);
  const upcoming = useMemo(() => {
    if (!valid) return [];
    const out: Date[] = [];
    let from = new Date();
    for (let i = 0; i < 5; i++) {
      const n = nextRun(shown, from);
      if (!n) break;
      out.push(n);
      from = n;
    }
    return out;
  }, [shown, valid]);
  const finer = valid && schedule.trim() !== "" && (intervalMs(shown) ?? Infinity) < (intervalMs(job.schedule) ?? 0);
  const changed = enabled !== job.enabled || (schedule.trim() === job.schedule ? "" : schedule.trim()) !== (job.overridden ? job.effectiveSchedule : "") || note !== job.note;

  const save = () =>
    start(async () => {
      const res = await saveJobSettingsAction(job.key, { enabled, schedule: schedule.trim() || null, note }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Could not save." }));
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  const reset = () =>
    start(async () => {
      const res = await resetJobSettingsAction(job.key).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Could not reset." }));
      if (res.ok) {
        setEnabled(true);
        setSchedule("");
        setNote("");
        setMsg({ ok: true, text: "Back to the default." });
        router.refresh();
      } else setMsg({ ok: false, text: res.error });
    });

  return (
    <div className="space-y-3 rounded-xl border bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Configuration</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-primary" checked={enabled} disabled={!canEdit} onChange={(e) => setEnabled(e.target.checked)} />
        {enabled ? "Enabled" : <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"><Pause className="size-3.5" /> Paused: skipped when its schedule fires (Run now still works)</span>}
      </label>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Schedule <span className="font-normal text-muted-foreground">(UTC; minute hour day-of-month month day-of-week)</span></p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => <button key={p.label} type="button" disabled={!canEdit} onClick={() => setSchedule(p.schedule ?? "")} className={`rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted ${(p.schedule ?? "") === schedule.trim() ? "border-primary bg-primary/10 text-primary" : ""}`}>{p.label}</button>)}
        </div>
        <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} disabled={!canEdit} placeholder={`Default: ${job.schedule}`} className="max-w-sm font-mono" aria-label={`Schedule for ${job.name}`} />
        {!valid && <p className="text-xs text-destructive">That isn&apos;t a valid schedule. Five fields, e.g. <code>30 2 * * *</code> for every day at 02:30 UTC.</p>}
        {valid && <p className="text-xs text-muted-foreground">{describeCron(shown)}. Next runs: {upcoming.map((d) => d.toLocaleString([], { dateStyle: "short", timeStyle: "short" })).join(" · ")} <span>(your time)</span></p>}
        {finer && mode === "vercel" && <p className="text-xs text-amber-700 dark:text-amber-300">On Vercel this job is only called at its registered times ({describeCron(job.schedule)}), so a schedule more frequent than that does not take effect unless the in-app scheduler is on or a faster Vercel cron is added (edit <code>src/lib/cron/registry.ts</code>, then <code>npm run cron:sync</code>). A less frequent schedule works: the calls in between are skipped.</p>}
        {schedule.trim() !== "" && mode === "none" && <p className="text-xs text-amber-700 dark:text-amber-300">Nothing starts jobs on a schedule on this server yet, so this takes effect once the in-app scheduler is on (RUN_SCHEDULER=1) or a scheduler calls the job&apos;s URL.</p>}
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Note <span className="font-normal text-muted-foreground">(shown in the list)</span></p>
        <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} disabled={!canEdit} placeholder="e.g. Paused while we migrate billing" className="max-w-lg" aria-label={`Note for ${job.name}`} />
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={pending || !valid || !changed} onClick={save}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save</Button>
          {(job.overridden || !job.enabled || job.note) && <Button type="button" size="sm" variant="outline" disabled={pending} onClick={reset}><RotateCcw className="size-3.5" /> Back to default</Button>}
          {msg && <span role="status" className={`text-sm ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}

/** Who is emailed when a job fails. */
function AlertRecipients({ initial, canEdit }: { initial: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(initial.join(", "));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const list = text.split(/[,\s;]+/).filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-4 text-sm">
      <Bell className="size-4 shrink-0 text-primary" />
      <span className="font-medium">Email when a job fails:</span>
      <Input value={text} onChange={(e) => setText(e.target.value)} disabled={!canEdit} placeholder="ops@yourcompany.com, cto@yourcompany.com" className="min-w-64 max-w-md flex-1" aria-label="Failure alert recipients" />
      {canEdit && <Button type="button" size="sm" disabled={pending || list.join(",") === initial.join(",")} onClick={() => start(async () => { const res = await saveAlertEmailsAction(list).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Could not save." })); setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error }); if (res.ok) router.refresh(); })}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save</Button>}
      <span className="text-xs text-muted-foreground">At most one email per job every 6 hours.</span>
      {msg && <span role="status" className={msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>{msg.text}</span>}
    </div>
  );
}
