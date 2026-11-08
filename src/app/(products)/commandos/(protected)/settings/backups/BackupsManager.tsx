"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BackupView } from "@/lib/products/commandos/backups";
import type { DataEventView, RestoreView } from "@/lib/products/commandos/data-lifecycle";
import DangerDialog, { type DangerAction } from "./DangerDialog";
import { backupNowAction, cancelDeletionAction } from "./actions";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const th = "py-2 pr-3 text-left text-xs font-medium text-muted-foreground";

export default function BackupsManager({ backups, restores, events, deletion, readOnly }: { backups: BackupView[]; restores: RestoreView[]; events: DataEventView[]; deletion: { purgeAt: string; requestedBy: string } | null; readOnly: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [dialog, setDialog] = useState<{ action: DangerAction; refId?: string; backup?: BackupView } | null>(null);
  const refresh = () => router.refresh();
  const label = (id: string) => { const b = backups.find((x) => x.id === id); return b ? when(b.at) : "an older backup"; };

  const consequences: Record<DangerAction, { title: string; items: string[]; confirm: string }> = {
    restore: {
      title: `Restore the backup of ${dialog?.backup ? when(dialog.backup.at) : ""}`,
      items: [
        "Your records go back to how they were in this backup. Anything created since is removed.",
        "A safety copy of your data right now is saved first and kept for 30 days, so you can undo this by restoring that copy.",
        "Accounts, passwords and sign-ins are not touched. Uploaded files are not part of a backup.",
        "The restore is written to the restore history.",
      ],
      confirm: "Restore now",
    },
    wipe: {
      title: "Delete all my data",
      items: [
        "Every record, setting and uploaded file in your workspace is deleted: employees, clients, leads, invoices, projects, documents, your website and the rest.",
        "Your company, your accounts and your subscription stay, so you can sign in and start again from scratch.",
        "Uploaded files are deleted for good. A safety copy of your records is kept for 30 days and can be restored (without the files).",
      ],
      confirm: "Delete all my data",
    },
    delete: {
      title: "Delete my company",
      items: [
        "Your whole company is scheduled for permanent deletion in 30 days: every record, file, domain and account.",
        "For those 30 days your workspace is read-only, and you can cancel and bring everything back from this page.",
        "On the 30th day it is deleted for good and cannot be recovered. Download a backup first if you want to keep a copy.",
      ],
      confirm: "Schedule deletion",
    },
  };

  return (
    <div className="space-y-4">
      {deletion && (
        <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="font-semibold text-destructive">Scheduled for permanent deletion on {new Date(deletion.purgeAt).toLocaleDateString("en-IN", { dateStyle: "long" })}.</p>
          <p className="mt-1 text-sm">Requested by {deletion.requestedBy}. Until then your workspace is read-only. Cancel to bring the account back exactly as it was.</p>
          <Button type="button" className="mt-3" size="sm" disabled={pending} onClick={() => start(async () => { const r = await cancelDeletionAction(); if (r.ok) { setNote({ ok: true, text: "Deletion cancelled. Your workspace is writable again." }); refresh(); } else setNote({ ok: false, text: r.error }); })}>Cancel deletion and restore my account</Button>
        </div>
      )}
      {note && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${note.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive"}`}>{note.text}</p>}

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Backups</CardTitle>
          <CardDescription>Every week we save a backup of your workspace (the last 8 are kept). Make one any time, and download any of them: the file you download is exactly the one stored and the one a restore reads. Passwords and saved API keys are never in a backup; uploaded files stay in their products.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button type="button" size="sm" disabled={pending} onClick={() => start(async () => { setNote(null); const r = await backupNowAction(); setNote(r.ok ? { ok: true, text: "Backup saved." } : { ok: false, text: r.error }); refresh(); })}>Back up now</Button>
          {backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No backup yet. The first scheduled one is made within a week, or make one now.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>When</th><th className={th}>Type</th><th className={th}>Records</th><th className={th}>Size</th><th className={th}>Status</th><th className={th} /></tr></thead>
                <tbody className="divide-y divide-border/50">
                  {backups.map((b) => (
                    <tr key={b.id}>
                      <td className="py-2 pr-3 whitespace-nowrap">{when(b.at)}</td>
                      <td className="py-2 pr-3">{b.label}{b.byEmail ? <span className="block text-xs text-muted-foreground">{b.byEmail}</span> : null}{b.keepUntil ? <span className="block text-xs text-muted-foreground">kept until {new Date(b.keepUntil).toLocaleDateString("en-IN")}</span> : null}</td>
                      <td className="py-2 pr-3 tabular-nums">{b.status === "ok" ? b.rows.toLocaleString("en-IN") : "—"}</td>
                      <td className="py-2 pr-3 tabular-nums">{b.status === "ok" ? size(b.bytes) : "—"}</td>
                      <td className="py-2 pr-3">{b.status === "ok" ? "Saved" : <span className="text-destructive" title={b.error ?? ""}>Failed</span>}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {b.downloadable && (
                          <>
                            <a href={`/api/commandos/backups/${b.id}/download`} download className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:border-primary/40 hover:text-primary"><Download className="size-3.5" />Download</a>
                            {!readOnly && <Button type="button" variant="outline" size="xs" className="ml-1.5" onClick={() => setDialog({ action: "restore", refId: b.id, backup: b })}><RotateCcw className="size-3.5" data-icon="inline-start" />Restore</Button>}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle className="text-base">Restore history</CardTitle><CardDescription>Every restore: who made it, which backup it used, what it changed, and the safety copy taken just before it (download it to undo).</CardDescription></CardHeader>
        <CardContent>
          {restores.length === 0 ? <p className="text-sm text-muted-foreground">No restore yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>When</th><th className={th}>By</th><th className={th}>Backup used</th><th className={th}>Result</th><th className={th} /></tr></thead>
                <tbody className="divide-y divide-border/50">
                  {restores.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-3 whitespace-nowrap">{when(r.at)}</td>
                      <td className="py-2 pr-3">{r.byEmail}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{label(r.backupId) === "an older backup" ? when(r.backupAt) : label(r.backupId)}</td>
                      <td className="py-2 pr-3">{r.status === "done" ? `Done · ${r.records.toLocaleString("en-IN")} written back, ${r.removed.toLocaleString("en-IN")} removed in ${r.collections} areas` : r.status === "running" ? "Running…" : <span className="text-destructive" title={r.error ?? ""}>Failed</span>}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <a href={`/api/commandos/backups/${r.backupId}/download`} download className="text-xs font-medium text-primary hover:underline">Backup used</a>
                        {r.safetyBackupId && <a href={`/api/commandos/backups/${r.safetyBackupId}/download`} download className="ml-3 text-xs font-medium text-primary hover:underline">Safety copy</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle className="text-base text-destructive">Delete data</CardTitle><CardDescription>Two different things. Each one asks you to confirm in four steps: the company&apos;s name, a phrase, your password and, if you use it, your two-step code.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border p-4">
            <p className="font-semibold">Delete all my data</p>
            <p className="text-sm text-muted-foreground">Empties the workspace (records, settings and files) but keeps your company, accounts and subscription. Start again from scratch. A safety copy of the records is kept for 30 days.</p>
            <Button type="button" variant="outline" size="sm" disabled={readOnly} onClick={() => setDialog({ action: "wipe" })}>Delete all my data…</Button>
          </div>
          <div className="space-y-2 rounded-xl border border-destructive/40 p-4">
            <p className="font-semibold">Delete my company permanently</p>
            <p className="text-sm text-muted-foreground">The whole company and all its data are deleted for good after 30 days. Until then it is read-only and you can cancel and restore your account.</p>
            <Button type="button" variant="destructive" size="sm" disabled={readOnly || !!deletion} onClick={() => setDialog({ action: "delete" })}>{deletion ? "Deletion is scheduled" : "Delete my company…"}</Button>
          </div>
        </CardContent>
      </GlassCard>

      {events.length > 0 && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle className="text-base">Deletion history</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/50 text-sm">{events.map((e) => <li key={e.id} className="py-2"><span className="font-medium">{e.label}</span> <span className="text-xs text-muted-foreground">· {when(e.at)} · {e.byEmail}</span><br /><span className="text-muted-foreground">{e.note}</span></li>)}</ul>
          </CardContent>
        </GlassCard>
      )}

      {dialog && (
        <DangerDialog
          action={dialog.action}
          title={consequences[dialog.action].title}
          consequences={consequences[dialog.action].items}
          confirmLabel={consequences[dialog.action].confirm}
          refId={dialog.refId}
          onClose={() => setDialog(null)}
          onDone={(text) => { setDialog(null); setNote({ ok: true, text }); refresh(); }}
        />
      )}
    </div>
  );
}
