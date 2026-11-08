"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppWindow, Laptop, LogOut, ShieldAlert, Smartphone, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";
import type { SessionView } from "@/lib/security/sessions";
import { revokeSessionAction, signOutEverywhereAction, signOutOthersAction } from "./actions";

const ICONS = { desktop: Laptop, mobile: Smartphone, tablet: Tablet, app: AppWindow } as const;

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Where the account is signed in: every device with its place and time, each with its own "Log out", plus "log out others" and "log out everywhere". */
export default function SessionsList({ sessions, onChange }: { sessions: SessionView[]; onChange?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [, start] = useTransition();
  const others = sessions.filter((s) => !s.current).length;

  function endOne(s: SessionView) {
    setBusy(s.id);
    setNote(null);
    start(async () => {
      const res = await revokeSessionAction(s.id).catch(() => ({ ok: true }));
      setBusy(null);
      if (res && "error" in res && res.error) return setNote({ ok: false, text: res.error });
      setNote({ ok: true, text: `${s.deviceLabel} was signed out.` });
      router.refresh();
      onChange?.();
    });
  }
  function endOthers() {
    setBusy("others");
    setNote(null);
    start(async () => {
      const res = await signOutOthersAction();
      setBusy(null);
      setNote({ ok: true, text: res.count ? `Signed out of ${res.count} other device${res.count === 1 ? "" : "s"}.` : "There were no other devices." });
      router.refresh();
      onChange?.();
    });
  }
  function endAll() {
    setBusy("all");
    start(async () => {
      await signOutEverywhereAction();
    });
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2" aria-label="Devices signed in">
        {sessions.map((s) => {
          const Icon = ICONS[s.deviceType];
          return (
            <li key={s.id} className={cn("flex flex-wrap items-center gap-3 rounded-2xl border p-3.5 transition-colors", s.current ? "border-primary/40 bg-primary/5" : "border-border/60")}>
              <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", s.current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {s.deviceLabel}
                  {s.current && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">This device</span>}
                  {s.via === "support" && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">Platform support</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span aria-hidden>{s.flag}</span> {s.place}
                  {s.ip ? <span className="ml-2 font-mono">· {s.ip}</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground" suppressHydrationWarning>
                  Signed in {formatDateTime(s.signedInAt)} · Last active {ago(s.lastActiveAt)}
                </p>
              </div>
              <Button type="button" size="sm" variant={s.current ? "outline" : "destructive"} disabled={busy !== null} onClick={() => endOne(s)} aria-label={`Log out ${s.deviceLabel}`}>
                <LogOut className="size-3.5" data-icon="inline-start" /> {busy === s.id ? "Logging out…" : s.current ? "Log out here" : "Log out"}
              </Button>
            </li>
          );
        })}
        {sessions.length === 0 && <li className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No other sign-ins are open.</li>}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button type="button" variant="outline" disabled={busy !== null || others === 0} onClick={endOthers}>
          {busy === "others" ? "Working…" : `Log out other devices${others ? ` (${others})` : ""}`}
        </Button>
        {!confirmAll ? (
          <Button id="security-signout-all" type="button" variant="destructive" disabled={busy !== null} onClick={() => setConfirmAll(true)}>
            <ShieldAlert className="size-4" data-icon="inline-start" /> Log out everywhere
          </Button>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            This ends every sign-in, including this one.
            <Button type="button" size="sm" variant="destructive" disabled={busy !== null} onClick={endAll}>{busy === "all" ? "Logging out…" : "Yes, log out everywhere"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmAll(false)}>Cancel</Button>
          </span>
        )}
        {note && <p className={cn("text-sm", note.ok ? "text-muted-foreground" : "text-destructive")} role="status">{note.text}</p>}
      </div>
    </div>
  );
}
