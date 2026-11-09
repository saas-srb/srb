"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CompareRow, VersionRow } from "@/app/(products)/contractflow-ai/(protected)/clones/list-actions";

/** What the panel needs from a host product: its own server actions. */
export interface VersionsApi {
  list(): Promise<{ ok: true; versions: VersionRow[] } | { ok: false; message: string }>;
  compare(from: number, to: number): Promise<{ ok: true; summary: string; rows: CompareRow[]; identical: boolean } | { ok: false; message: string }>;
  restore(n: number): Promise<{ ok: true } | { ok: false; message: string }>;
}
import { FIELD, fmtDate } from "@/components/products/playbook-ai/items/shared";

const WORD = { equal: "", add: "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300", remove: "bg-red-500/20 text-red-800 line-through dark:text-red-300" } as const;
const SOURCE: Record<string, string> = { created: "Copied from Playbook", edit: "Edited", ai: "Edited with AI", restore: "Restored" };

/** Every saved version of the document, what happened to each ("sent version 3"), and a comparison of any two with additions and removals highlighted. */
export default function VersionsPanel({ api, canRestore, onRestored }: { api: VersionsApi; canRestore: boolean; onRestored?: () => void }) {
  const router = useRouter();
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [result, setResult] = useState<{ summary: string; rows: CompareRow[]; identical: boolean } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void api.list().then((r) => {
      if (cancelled) return;
      if (!r.ok) { setError(r.message); return; }
      setVersions(r.versions);
      if (r.versions.length >= 2) { setTo(r.versions[0].number); setFrom(r.versions[1].number); }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function compare() {
    if (from === null || to === null) return;
    setError(null);
    start(async () => {
      const r = await api.compare(from, to);
      if (!r.ok) { setError(r.message); return; }
      setResult({ summary: r.summary, rows: r.rows, identical: r.identical });
    });
  }
  function restore(n: number) {
    start(async () => {
      const r = await api.restore(n);
      if (!r.ok) { toast.error(r.message); return; }
      toast.success(`Version ${n} was restored as a new version`);
      if (onRestored) onRestored(); else router.refresh();
    });
  }

  if (error && !versions) return <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>;
  if (!versions) return <p className="text-sm text-muted-foreground" role="status">Loading versions…</p>;
  if (versions.length === 0) return <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No versions are recorded for this document.</p>;
  return (
    <div className="grid gap-4">
      <ol className="space-y-2">
        {versions.map((v) => (
          <li key={v.number} className="rounded-xl border bg-card p-3 text-sm">
            <p className="font-semibold">Version {v.number} <span className="font-normal text-muted-foreground">· {SOURCE[v.source] ?? v.source}</span></p>
            <p className="text-xs text-muted-foreground">{v.summary}</p>
            <p className="text-xs text-muted-foreground">{v.by || "ContractFlow"} · {fmtDate(v.at)}</p>
            {v.statuses.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{v.statuses.map((s, i) => <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary" title={`${fmtDate(s.at)}${s.note ? `: ${s.note}` : ""}`}>{s.status} version {v.number}</span>)}</p>}
            {canRestore && v.number !== versions[0].number && <Button size="sm" variant="outline" className="mt-2" disabled={pending} onClick={() => restore(v.number)}>Restore this version</Button>}
          </li>
        ))}
      </ol>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 text-sm">
          <label className="text-xs">Older<select className={`${FIELD} w-32`} value={from ?? ""} onChange={(e) => setFrom(Number(e.target.value))}>{versions.map((v) => <option key={v.number} value={v.number}>Version {v.number}</option>)}</select></label>
          <label className="text-xs">Newer<select className={`${FIELD} w-32`} value={to ?? ""} onChange={(e) => setTo(Number(e.target.value))}>{versions.map((v) => <option key={v.number} value={v.number}>Version {v.number}</option>)}</select></label>
          <Button onClick={compare} disabled={pending || from === null || to === null || from === to}>{pending ? "Comparing…" : "Compare"}</Button>
        </div>
        {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
        {result && (result.identical ? <p className="rounded-xl border p-4 text-sm">These two versions have the same content.</p> : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{result.summary}.</p>
            <ul className="space-y-2">
              {result.rows.map((e) => (
                <li key={`${e.zone}:${e.id}`} className="rounded-xl border bg-card p-3 text-sm">
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{e.kind} · {e.blockType}</p>
                  {e.words ? <p>{e.words.map((w, i) => <span key={i} className={WORD[w.op]}>{w.text}</span>)}</p>
                    : e.kind === "removed" ? <p className="text-red-700 line-through dark:text-red-300">{e.before}</p>
                    : e.kind === "added" ? <p className="text-emerald-700 dark:text-emerald-300">{e.after}</p>
                    : <p>{e.after ?? e.before}</p>}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!result && <p className="text-sm text-muted-foreground">Choose two versions and compare them. Added words are green, removed words are red.</p>}
      </div>
    </div>
  );
}
