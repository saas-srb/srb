"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { INCIDENT_COMPONENTS, INCIDENT_IMPACTS, INCIDENT_STATUSES, formatDuration, type IncidentView } from "@/lib/platform/status/shared";
import { createIncidentAction, deleteIncidentAction, updateIncidentAction } from "./actions";

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const impactLabel = (k: string) => INCIDENT_IMPACTS.find((i) => i.key === k)?.label ?? k;

function Update({ inc, onDone }: { inc: IncidentView; onDone: () => void }) {
  const [status, setStatus] = useState<string>(inc.status === "resolved" ? "investigating" : inc.status);
  const [message, setMessage] = useState("");
  const [ended, setEnded] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="mt-3 grid gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-[10rem_1fr_auto]" onSubmit={(e) => { e.preventDefault(); setError(null); start(async () => { const r = await updateIncidentAction(inc.id, { status, message, endedAt: status === "resolved" && ended ? ended : undefined }); if (r.ok) { setMessage(""); setEnded(""); onDone(); } else setError(r.error); }); }}>
      <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="New status">{INCIDENT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
      <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What changed? (shown on the status page)" maxLength={2000} aria-label="Update" />
      <Button type="submit" size="sm" disabled={pending || !message.trim()}>Post update</Button>
      {status === "resolved" && (
        <div className="sm:col-span-3 flex items-center gap-2 text-xs text-muted-foreground"><Label htmlFor={`end-${inc.id}`} className="text-xs">It actually ended at (leave blank for now)</Label><Input id={`end-${inc.id}`} type="datetime-local" value={ended} onChange={(e) => setEnded(e.target.value)} className="h-8 w-52" /></div>
      )}
      {error && <p role="alert" className="sm:col-span-3 text-sm text-destructive">{error}</p>}
    </form>
  );
}

export default function IncidentsManager({ incidents, uptime30, uptime90 }: { incidents: IncidentView[]; uptime30: number; uptime90: number }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [impact, setImpact] = useState<string>("degraded");
  const [components, setComponents] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [started, setStarted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const refresh = () => router.refresh();
  const open = incidents.filter((i) => i.status !== "resolved");
  const past = incidents.filter((i) => i.status === "resolved");

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Uptime, last 30 days", `${uptime30}%`], ["Uptime, last 90 days", `${uptime90}%`], ["Open incidents", String(open.length)]].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border/60 bg-card p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold tabular-nums">{v}</p></div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Uptime counts the time covered by full outages and major problems in this record, so it is only as complete as the record. Degraded performance and planned maintenance don&apos;t count as downtime.</p>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle className="text-base">Report an incident</CardTitle><CardDescription>It appears on the public status page straight away.</CardDescription></CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setError(null); start(async () => { const r = await createIncidentAction({ title, impact, components, message, startedAt: started || undefined }); if (r.ok) { setTitle(""); setMessage(""); setComponents([]); setStarted(""); refresh(); } else setError(r.error); }); }}>
            <div className="space-y-1.5"><Label htmlFor="inc-title">Title</Label><Input id="inc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="e.g. Sign-in is slow" /></div>
            <div className="space-y-1.5"><Label htmlFor="inc-impact">How bad</Label><select id="inc-impact" className={sel} value={impact} onChange={(e) => setImpact(e.target.value)}>{INCIDENT_IMPACTS.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}</select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>What is affected</Label><div className="flex flex-wrap gap-3">{INCIDENT_COMPONENTS.map((c) => (<label key={c} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={components.includes(c)} onChange={(e) => setComponents((cur) => e.target.checked ? [...cur, c] : cur.filter((x) => x !== c))} />{c}</label>))}</div></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="inc-msg">What is happening</Label><Textarea id="inc-msg" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={3} placeholder="Plain words, what people notice and what you are doing." /></div>
            <div className="space-y-1.5"><Label htmlFor="inc-start">Started at (leave blank for now)</Label><Input id="inc-start" type="datetime-local" value={started} onChange={(e) => setStarted(e.target.value)} /></div>
            <div className="flex items-end"><Button type="submit" disabled={pending || !title.trim() || !message.trim()}>Publish incident</Button></div>
            {error && <p role="alert" className="sm:col-span-2 text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </GlassCard>

      {[["Open", open], ["Resolved", past]].map(([label, list]) => (
        <section key={label as string} className="space-y-3" aria-label={`${label} incidents`}>
          <h2 className="text-sm font-semibold">{label as string} ({(list as IncidentView[]).length})</h2>
          {(list as IncidentView[]).length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
          {(list as IncidentView[]).map((i) => (
            <GlassCard key={i.id} interactive={false}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-semibold">{i.title}</p><p className="text-xs text-muted-foreground">{impactLabel(i.impact)} · {when(i.startedAt)}{i.resolvedAt ? ` · lasted ${formatDuration(Date.parse(i.resolvedAt) - Date.parse(i.startedAt))}` : ""}</p></div>
                {i.components.length > 0 && <p className="text-xs text-muted-foreground">Affects: {i.components.join(", ")}</p>}
                <ol className="space-y-1 border-l pl-3 text-sm">{[...i.updates].reverse().map((u, k) => (<li key={k}><span className="font-medium">{INCIDENT_STATUSES.find((s) => s.key === u.status)?.label}</span> <span className="text-xs text-muted-foreground">{when(u.at)}</span><br />{u.message}</li>))}</ol>
                <Update inc={i} onDone={refresh} />
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm("Delete this incident from the status page and the uptime record?")) void deleteIncidentAction(i.id).then(refresh); }}>Delete</Button>
              </CardContent>
            </GlassCard>
          ))}
        </section>
      ))}
    </div>
  );
}
