"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ITC_DECISIONS, type ItcDecision } from "@/lib/products/cashflow-ai/gst/core";
import { exportPurchasesCsvAction, saveDecisionAction } from "@/app/(products)/cashflow-ai/(protected)/gst/purchases/actions";
import { cn } from "@/lib/utils";

const DECISION_STYLE: Record<ItcDecision, string> = {
  review: "border-border text-foreground",
  eligible: "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400",
  reverse_charge: "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400",
  blocked: "border-destructive/50 bg-destructive/10 text-destructive",
  ineligible: "border-border bg-muted text-muted-foreground",
};

export function MonthPicker({ month, max }: { month: string; max: string }) {
  const router = useRouter();
  return (
    <label className="text-xs text-muted-foreground">
      Month
      <input type="month" aria-label="Month of purchases" value={month} max={max} onChange={(e) => e.target.value && router.push(`/cashflow-ai/gst/purchases?month=${e.target.value}`)} className="mt-1 block h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground" />
    </label>
  );
}

export function DecisionCell({ billId, billLabel, decision: initialDecision, note: initialNote, canManage }: { billId: string; billLabel: string; decision: ItcDecision; note: string; canManage: boolean }) {
  const [decision, setDecision] = useState(initialDecision);
  const [note, setNote] = useState(initialNote);
  const [saved, setSaved] = useState({ decision: initialDecision, note: initialNote });
  const [pending, start] = useTransition();

  function save(next: { decision: ItcDecision; note: string }) {
    const prev = saved;
    start(async () => {
      try {
        const res = await saveDecisionAction(billId, next.decision, next.note);
        if (res.ok) setSaved(next);
        else {
          setDecision(prev.decision);
          setNote(prev.note);
          toast.error(res.error);
        }
      } catch {
        setDecision(prev.decision);
        setNote(prev.note);
        toast.error("Could not save. Please try again.");
      }
    });
  }

  const help = ITC_DECISIONS.find((d) => d.value === decision)?.help;
  return (
    <div className="flex min-w-48 flex-col gap-1">
      <select
        aria-label={`Input credit decision for ${billLabel}`}
        title={help}
        value={decision}
        disabled={!canManage || pending}
        onChange={(e) => {
          const next = e.target.value as ItcDecision;
          setDecision(next);
          save({ decision: next, note });
        }}
        className={cn("h-8 rounded-lg border px-2 text-xs font-medium disabled:opacity-70", DECISION_STYLE[decision])}
      >
        {ITC_DECISIONS.map((d) => (
          <option key={d.value} value={d.value}>{d.label}</option>
        ))}
      </select>
      <input
        aria-label={`Note for ${billLabel}`}
        value={note}
        maxLength={500}
        disabled={!canManage || pending}
        placeholder={canManage ? "Note (optional)" : ""}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note.trim() !== saved.note && save({ decision, note })}
        className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground disabled:opacity-70"
      />
    </div>
  );
}

export function DownloadCsvButton({ month }: { month: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const res = await exportPurchasesCsvAction(month);
            if (!res.ok) return void toast.error(res.error);
            const url = URL.createObjectURL(new Blob(["﻿" + res.csv], { type: "text/csv;charset=utf-8" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = res.filename;
            a.click();
            URL.revokeObjectURL(url);
          } catch {
            toast.error("Could not prepare the file. Please try again.");
          }
        })
      }
    >
      <Download /> {pending ? "Preparing…" : "Download CSV"}
    </Button>
  );
}
