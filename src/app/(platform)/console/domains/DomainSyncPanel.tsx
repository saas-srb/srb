"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { domainSyncStatusAction, exportDomainProblemsAction, retryHostSyncAction, startDomainSyncAction, tickDomainSyncAction } from "./actions";
import type { DomainSyncOverview } from "@/lib/platform/domains/sync/run";
import type { HostProblem } from "@/lib/platform/domains/sync/store";

const ACTION_LABEL: Record<string, string> = {
  released: "Released from old project",
  release_failed: "Release failed",
  attached: "Attached",
  refreshed: "Status refreshed",
  owned_elsewhere: "Owned elsewhere",
  failed: "Failed",
  would_release: "Would release",
  would_attach: "Would attach",
  would_refresh: "Would refresh",
  already_attached: "Already attached",
  needs_txt: "Needs TXT / still elsewhere",
};

/** Domain sync controls: run it (optionally as a dry run), watch progress, see what happened, retry the failed hosts, export them. */
export default function DomainSyncPanel({ initial, problems }: { initial: DomainSyncOverview; problems: HostProblem[] }) {
  const router = useRouter();
  const [ov, setOv] = useState(initial);
  const [dryRun, setDryRun] = useState(false);
  const [busy, startTransition] = useTransition();
  const [retrying, setRetrying] = useState<string | null>(null);
  const ticking = useRef(false);
  const running = ov.run?.status === "running";

  const tick = useCallback(async () => {
    if (ticking.current) return;
    ticking.current = true;
    try {
      const res = await tickDomainSyncAction();
      if (res.ok) {
        setOv(res.overview);
        if (res.overview.run?.status !== "running") router.refresh();
      }
    } catch {
      /* the next poll retries; the run itself is stored */
    } finally {
      ticking.current = false;
    }
  }, [router]);

  // While a run is in progress keep working on it from here (a tick is about 40 s), so it finishes without the cron.
  useEffect(() => {
    if (!running) return;
    void tick();
    const id = setInterval(() => void tick(), 3_000);
    return () => clearInterval(id);
  }, [running, tick]);

  // Another admin (or the cron) may have started one: look now and then.
  useEffect(() => {
    if (running) return;
    const id = setInterval(async () => {
      const res = await domainSyncStatusAction().catch(() => null);
      if (res?.ok) setOv(res.overview);
    }, 20_000);
    return () => clearInterval(id);
  }, [running]);

  function start() {
    startTransition(async () => {
      const res = await startDomainSyncAction(dryRun);
      if (res.ok) {
        setOv(res.overview);
        toast.success(res.message ?? (dryRun ? "Dry run started: nothing will be changed." : "Sync started."));
      } else toast.error(res.error);
    });
  }

  async function retry(host: string) {
    setRetrying(host);
    const res = await retryHostSyncAction(host).catch(() => ({ ok: false as const, error: "Request failed" }));
    setRetrying(null);
    if (res.ok) toast.success(res.message);
    else toast.error(res.error);
    router.refresh();
  }

  async function exportCsv() {
    const res = await exportDomainProblemsAction();
    if (!res.ok) return toast.error(res.error);
    const url = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `domains-needing-attention-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const run = ov.run;
  const c = run?.counts;
  const pct = run && run.companiesTotal ? Math.min(100, Math.round(((c?.companies ?? 0) / run.companiesTotal) * 100)) : run?.status === "done" ? 100 : 0;

  return (
    <GlassCard interactive={false}>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground">Domain sync</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
              Puts every company address and customer domain on the current Vercel project, so nothing has to be added by hand after a move.
              {ov.wildcard ? " The wildcard is on, so only customers' own domains are attached." : ""}
              {ov.previousConfigured ? " Hosts are released from the previous project first." : ""}
              {" "}It also runs daily, and when the Vercel settings change.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} disabled={running} className="size-4" />
              Dry run (change nothing)
            </label>
            <Button onClick={start} disabled={!ov.configured || running || busy}>
              {running || busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
              Sync all domains now
            </Button>
          </div>
        </div>
        {!ov.configured && <p className="text-sm text-destructive">Vercel isn&apos;t configured yet. Save the token and project id in Integrations → Domains &amp; hosting.</p>}

        {run && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {running ? `Sync running ${c?.companies ?? 0}/${run.companiesTotal}` : run.status === "done" ? `Last sync finished${run.dryRun ? " (dry run)" : ""}` : "Last sync stopped"}
                {run.dryRun && running ? " (dry run)" : ""}
              </span>
              <span className="text-xs text-muted-foreground">Started {new Date(run.startedAt).toLocaleString()}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            {c && (
              <p className="text-xs text-muted-foreground">
                {c.hosts} hosts looked at · {c.alreadyOk} already fine · {c.attached} attached · {c.released} released · {c.refreshed} refreshed · {c.skippedWildcard} covered by the wildcard · {c.ownedElsewhere} owned elsewhere or need a TXT record · {c.failed} failed
                {run.dryRun ? ` · would attach ${c.wouldAttach}, would release ${c.wouldRelease}` : ""}
              </p>
            )}
            {run.error && <p className="text-xs text-destructive">{run.error}</p>}
          </div>
        )}

        {ov.events.length > 0 && (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Log of the last run ({ov.events.length} latest)</summary>
            <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-xs">
              {ov.events.map((e, i) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span className="text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</span>
                  <span className="font-mono">{e.host}</span>
                  <span className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</span>
                  <span className="min-w-0 break-words text-muted-foreground">{e.detail}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Needs attention ({problems.length})</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={start} disabled={!ov.configured || running || busy || problems.length === 0}>
                <RefreshCw className="mr-1.5 size-3.5" /> Retry all
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="mr-1.5 size-3.5" /> Export CSV
              </Button>
            </div>
          </div>
          {problems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No address is failing or owned by another account.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {problems.slice(0, 100).map((p) => (
                <li key={p.host} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-mono font-medium">{p.host}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.companyName} · {p.kind === "owned_elsewhere" ? "Owned by another Vercel project or account" : "Failed"}
                    </p>
                    {p.reason && <p className="mt-1 break-words text-xs">{p.reason}</p>}
                    {p.records.map((r, i) => (
                      <p key={i} className="mt-1 break-all font-mono text-xs text-muted-foreground">
                        {r.type} {r.name} {r.value}
                      </p>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" disabled={retrying === p.host || running} onClick={() => retry(p.host)}>
                    {retrying === p.host ? <Loader2 className="size-3.5 animate-spin" /> : "Retry"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {problems.length > 100 && <p className="text-xs text-muted-foreground">Showing 100 of {problems.length}. Export the CSV for all of them.</p>}
        </div>
      </CardContent>
    </GlassCard>
  );
}
