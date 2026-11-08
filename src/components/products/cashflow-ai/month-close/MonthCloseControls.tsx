"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clearStepAction, lockMonthAction, recordOverrideAction, recordStepAction, removeOverrideAction } from "@/app/(products)/cashflow-ai/(protected)/month-close/actions";

const field = "h-9 rounded-lg border border-border bg-background px-2 text-sm";

export function MonthPicker({ month, max }: { month: string; max: string }) {
  const router = useRouter();
  return (
    <label className="text-xs text-muted-foreground">
      Month
      <input type="month" aria-label="Month to close" value={month} max={max} onChange={(e) => e.target.value && router.push(`/cashflow-ai/month-close?month=${e.target.value}`)} className={`${field} mt-1 block`} />
    </label>
  );
}

async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string, after?: () => void) {
  try {
    const r = await fn();
    if (r.ok) {
      toast.success(done);
      after?.();
    } else toast.error(r.error);
  } catch {
    toast.error("Something went wrong. Please try again.");
  }
}

export function PersonStepControls({ month, stepKey, done, canEdit }: { month: string; stepKey: string; done: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  if (!canEdit) return null;
  if (done)
    return (
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => run(() => clearStepAction(month, stepKey), "Marked as not done", () => router.refresh()))}>
        Undo
      </Button>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(() => run(() => recordStepAction(month, stepKey, note), "Recorded", () => { setNote(""); router.refresh(); }));
      }}
    >
      <input aria-label="Note (optional)" placeholder="Note (optional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={`${field} w-56`} />
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Mark done"}</Button>
    </form>
  );
}

export function LockControls({ month, canLock, allowed, needsOverride, hasOverride }: { month: string; canLock: boolean; allowed: boolean; needsOverride: boolean; hasOverride: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  if (!canLock) return <p className="text-xs text-muted-foreground">Only a person allowed to manage fiscal periods can lock a month.</p>;
  return (
    <div className="space-y-3">
      {needsOverride && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(() => run(() => recordOverrideAction(month, reason), "Reason saved", () => { setReason(""); router.refresh(); }));
          }}
        >
          <label className="block text-xs text-muted-foreground">
            Lock anyway: why is it safe to close with these checks failing? This is kept and shown on this page.
            <textarea required minLength={10} maxLength={500} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background p-2 text-sm" />
          </label>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Save reason</Button>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || !allowed}
          onClick={() => {
            if (!window.confirm("Lock this month? Nobody can add or change entries dated in it afterwards, and a closing entry is posted.")) return;
            start(() => run(() => lockMonthAction(month), "Month locked", () => router.refresh()));
          }}
        >
          {pending ? "Locking…" : "Lock this month"}
        </Button>
        {hasOverride && (
          <Button variant="outline" disabled={pending} onClick={() => start(() => run(() => removeOverrideAction(month), "Reason removed", () => router.refresh()))}>
            Remove saved reason
          </Button>
        )}
      </div>
    </div>
  );
}
