"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  addFilingAction,
  deleteFilingAction,
  fillCalendarAction,
  markFiledAction,
  saveProfileAction,
  setFilingStatusAction,
  updateDatesAction,
  updateFilingAction,
} from "@/app/(products)/cashflow-ai/(protected)/compliance/actions";
import { FILING_CATEGORIES, PROFILE_QUESTIONS, type ComplianceProfile } from "@/lib/products/cashflow-ai/compliance/filings-core";

const field = "h-9 rounded-lg border border-border bg-background px-2 text-sm";

function useRun() {
  const [pending, start] = useTransition();
  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) toast.error(res.error ?? "Could not save.");
        else if (success) toast.success(success);
      } catch {
        toast.error("Could not save. Please try again.");
      }
    });
  }
  return { pending, run };
}

const answerValue = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");

/** The four yes/no questions, then the two buttons that fill and refresh the calendar from the platform's dates. */
export function CalendarSetupPanel({ profile, defaultFy, canManage }: { profile: ComplianceProfile; defaultFy: string; canManage: boolean }) {
  const { pending, run } = useRun();
  const [fy, setFy] = useState(defaultFy);
  const [answers, setAnswers] = useState(profile);
  const unanswered = PROFILE_QUESTIONS.filter((q) => q.key !== "isPrivateLimited" && answers[q.key] === null).length;

  function answer(key: keyof ComplianceProfile, value: string) {
    const v = value === "" ? null : value === "yes";
    setAnswers((a) => ({ ...a, [key]: v }));
    run(() => saveProfileAction({ [key]: v }), "Saved");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {PROFILE_QUESTIONS.map((q) => (
          <label key={q.key} className="space-y-1 text-sm">
            <span className="block font-medium">{q.question}</span>
            <span className="block text-xs text-muted-foreground">{q.help}</span>
            <select value={answerValue(answers[q.key])} disabled={!canManage || pending} onChange={(e) => answer(q.key, e.target.value)} className={`${field} w-40`}>
              <option value="">Not answered</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        ))}
      </div>
      {unanswered > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">Questions left as &quot;Not answered&quot; are treated as &quot;No&quot;, so their dates are left out. Answer them to add those dates.</p>}
      {canManage && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">Financial year
            <input value={fy} onChange={(e) => setFy(e.target.value.trim())} placeholder="2026-27" maxLength={7} className={`${field} mt-1 block w-28`} />
          </label>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await fillCalendarAction(fy);
                if (!res.ok) return res;
                toast.success(res.added ? `${res.added} dates added to your calendar for FY ${fy}.` : `Nothing new to add: your calendar already has every date for FY ${fy}.`);
                return { ok: true };
              })
            }
          >
            Fill in my filing calendar for FY {fy || "____"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await updateDatesAction(fy);
                if (!res.ok) return res;
                toast.success(res.moved ? `${res.moved} due date${res.moved === 1 ? "" : "s"} changed to match the law.` : "All dates already match the law.");
                if (res.skippedByHand) toast.message(`${res.skippedByHand} date${res.skippedByHand === 1 ? " was" : "s were"} left as you set ${res.skippedByHand === 1 ? "it" : "them"}.`);
                return { ok: true };
              })
            }
          >
            Update dates (the law changed or a date was extended)
          </Button>
        </div>
      )}
    </div>
  );
}

export function AddFilingForm() {
  const { pending, run } = useRun();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      action={(fd) => run(() => addFilingAction(fd), "Filing added")}
    >
      <label className="text-xs text-muted-foreground sm:col-span-2">Name<input name="name" required maxLength={160} placeholder="e.g. GST return for September" className={`${field} mt-1 w-full`} /></label>
      <label className="text-xs text-muted-foreground">Form / code<input name="form" maxLength={40} placeholder="GSTR-3B" className={`${field} mt-1 w-full`} /></label>
      <label className="text-xs text-muted-foreground">Type
        <select name="category" required defaultValue="" className={`${field} mt-1 w-full`}>
          <option value="" disabled>Choose…</option>
          {FILING_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">For which period<input name="period" maxLength={60} placeholder="Sep 2026 / FY 2025-26" className={`${field} mt-1 w-full`} /></label>
      <label className="text-xs text-muted-foreground">Due date<input type="date" name="dueDate" className={`${field} mt-1 w-full`} /></label>
      <label className="text-xs text-muted-foreground">Who is responsible<input name="owner" maxLength={120} className={`${field} mt-1 w-full`} /></label>
      <label className="flex items-end gap-2 pb-2 text-xs text-muted-foreground"><input type="checkbox" name="dueDateConfirmed" /> Date confirmed by your CA</label>
      <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" size="sm" disabled={pending}>Add to calendar</Button></div>
    </form>
  );
}

export function FilingRowActions({
  id,
  dueDate,
  dueDateConfirmed,
  filed,
  canManage,
}: {
  id: string;
  dueDate: string;
  dueDateConfirmed: boolean;
  filed: boolean;
  canManage: boolean;
}) {
  const { pending, run } = useRun();
  const [mode, setMode] = useState<"none" | "date" | "filed">("none");
  const [date, setDate] = useState(dueDate);
  const [confirmed, setConfirmed] = useState(dueDateConfirmed);
  const [filedOn, setFiledOn] = useState("");
  const [ack, setAck] = useState("");
  if (!canManage) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {!filed && <Button size="xs" variant="outline" onClick={() => setMode(mode === "filed" ? "none" : "filed")}>Mark filed</Button>}
        {!filed && <Button size="xs" variant="link" className="text-muted-foreground" onClick={() => setMode(mode === "date" ? "none" : "date")}>Change this date</Button>}
        {filed && <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => setFilingStatusAction(id, "pending"), "Moved back to pending")}>Undo filed</Button>}
        {!filed && <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => setFilingStatusAction(id, "not_applicable"), "Marked not applicable")}>Not applicable</Button>}
        <Button
          size="xs"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (confirm("Remove this filing from the calendar?")) run(() => deleteFilingAction(id), "Removed");
          }}
        >
          Remove
        </Button>
      </div>
      {mode === "date" && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} aria-label="Due date" />
          <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Confirmed by CA</label>
          <Button size="xs" disabled={pending} onClick={() => run(async () => { const r = await updateFilingAction(id, { dueDate: date, dueDateConfirmed: confirmed }); if (r.ok) setMode("none"); return r; }, "Date saved")}>Save</Button>
        </div>
      )}
      {mode === "filed" && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={filedOn} onChange={(e) => setFiledOn(e.target.value)} className={field} aria-label="Filed on" />
          <input value={ack} onChange={(e) => setAck(e.target.value)} placeholder="Acknowledgement / ARN no." maxLength={80} className={`${field} w-52`} />
          <Button size="xs" disabled={pending || !filedOn} onClick={() => run(async () => { const r = await markFiledAction(id, filedOn, ack); if (r.ok) setMode("none"); return r; }, "Marked as filed")}>Save</Button>
        </div>
      )}
    </div>
  );
}
