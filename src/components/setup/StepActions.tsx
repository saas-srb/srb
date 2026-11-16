"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface StepActionHandlers {
  review: (id: string, on: boolean) => Promise<{ ok: boolean; error?: string }>;
  notApplicable: (id: string, on: boolean, reason: string) => Promise<{ ok: boolean; error?: string }>;
}

/** "Mark as reviewed" and "Not applicable" for a Director; each is reversible. Plain text actions under the step. */
export default function StepActions({ id, manual, canNa, mark, handlers }: { id: string; manual: boolean; canNa: boolean; mark: "reviewed" | "notApplicable" | null; handlers: StepActionHandlers }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn().catch(() => ({ ok: false, error: "Something went wrong." })); if (!r.ok) setError(r.error ?? "Could not save."); else { setError(""); setAsking(false); router.refresh(); } });
  const link = "text-xs font-medium text-primary hover:underline disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {mark === "reviewed" && <button type="button" className={link} disabled={pending} onClick={() => run(() => handlers.review(id, false))}>Undo reviewed</button>}
      {mark === "notApplicable" && <button type="button" className={link} disabled={pending} onClick={() => run(() => handlers.notApplicable(id, false, ""))}>Undo not applicable</button>}
      {!mark && manual && <button type="button" className={link} disabled={pending} onClick={() => run(() => handlers.review(id, true))}>Mark as reviewed</button>}
      {!mark && canNa && !asking && <button type="button" className={link} disabled={pending} onClick={() => setAsking(true)}>Not applicable</button>}
      {asking && (
        <span className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`na-${id}`}>Reason</label>
          <input id={`na-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Short reason" maxLength={160} className="h-8 w-48 rounded-md border border-input bg-background px-2 text-xs" />
          <button type="button" className={link} disabled={pending || reason.trim().length < 3} onClick={() => run(() => handlers.notApplicable(id, true, reason))}>Save</button>
          <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setAsking(false)}>Cancel</button>
        </span>
      )}
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
