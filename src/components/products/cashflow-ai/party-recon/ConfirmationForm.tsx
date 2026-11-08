"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { previewConfirmationAction, saveConfirmationAction } from "@/app/(products)/cashflow-ai/(protected)/party-reconciliation/actions";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import type { ConfirmationComparison } from "@/lib/products/cashflow-ai/party-recon/core";

const field = "h-9 rounded-lg border border-border bg-background px-2 text-sm";

const STATUS_HELP: Record<string, string> = {
  requested: "You have asked them for their balance and are waiting.",
  agreed: "Their balance is the same as ours.",
  disputed: "Their balance differs and the difference is not settled yet.",
  written_off: "You have decided to let the difference go. This only records the decision; it does not change the books.",
};

export default function ConfirmationForm({
  kind,
  partyId,
  today,
  statuses,
  canManage,
}: {
  kind: "customer" | "vendor";
  partyId: string;
  today: string;
  statuses: { value: string; label: string }[];
  canManage: boolean;
}) {
  const [asOf, setAsOf] = useState(today);
  const [their, setTheir] = useState("");
  const [status, setStatus] = useState("requested");
  const [note, setNote] = useState("");
  const [cmp, setCmp] = useState<ConfirmationComparison | null>(null);
  const [pending, start] = useTransition();
  const who = kind === "customer" ? "customer" : "vendor";

  function check() {
    start(async () => {
      try {
        const res = await previewConfirmationAction({ kind, partyId, theirBalance: their, theirAsOf: asOf });
        if (!res.ok) {
          setCmp(null);
          toast.error(res.error);
        } else setCmp(res.comparison);
      } catch {
        toast.error("Could not check. Please try again.");
      }
    });
  }

  function save() {
    start(async () => {
      try {
        const res = await saveConfirmationAction({ kind, partyId, asOf, theirBalance: their, status, note });
        if (!res.ok) toast.error(res.error);
        else {
          toast.success("Saved");
          setNote("");
        }
      } catch {
        toast.error("Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Ask the {who} for the balance in their books on a date, then type it in. Use a minus sign for a balance in the other direction (for a {who}, that means {kind === "customer" ? "we owe them" : "they owe us"}).
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted-foreground">Their statement date<input type="date" value={asOf} max={today} onChange={(e) => { setAsOf(e.target.value); setCmp(null); }} className={`${field} mt-1 w-full`} /></label>
        <label className="text-xs text-muted-foreground">Balance they state (₹)<input inputMode="decimal" value={their} onChange={(e) => { setTheir(e.target.value); setCmp(null); }} placeholder="e.g. 1,25,000.00" maxLength={40} className={`${field} mt-1 w-full`} /></label>
        <label className="text-xs text-muted-foreground">Where it stands
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${field} mt-1 w-full`}>
            {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-1">Note (who confirmed, how)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className={`${field} mt-1 w-full`} /></label>
      </div>
      <p className="text-xs text-muted-foreground">{STATUS_HELP[status]}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={pending || their.trim() === ""} onClick={check}>Check the difference</Button>
        {canManage && <Button type="button" size="sm" disabled={pending} onClick={save}>Save this confirmation</Button>}
      </div>
      {!canManage && <p className="text-xs text-muted-foreground">You can check a figure, but saving a confirmation needs reconciliation access.</p>}

      {cmp && (
        <div className="rounded-xl border border-border/50 bg-muted/30 p-3 text-sm">
          <p>
            Our balance today is <strong>{formatMoney(cmp.ourBalance)}</strong>, theirs on {cmp.theirAsOf.split("-").reverse().join("-")} is <strong>{formatMoney(cmp.theirBalance)}</strong>.{" "}
            {cmp.matches ? <span className="font-medium text-green-700 dark:text-green-400">They agree.</span> : <span className="font-medium text-amber-700 dark:text-amber-400">We show {formatMoney(Math.abs(cmp.difference))} {cmp.difference > 0 ? "more" : "less"} than they do.</span>}
          </p>
          {cmp.explanations.length > 0 && (
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-muted-foreground">
              {cmp.explanations.map((e, i) => (
                <li key={i}><span className="font-medium text-foreground">{e.confidence === "exact" ? "Explains all of it. " : e.confidence === "possible" ? "Possible cause. " : "Worth asking. "}</span>{e.message}</li>
              ))}
            </ul>
          )}
          {!cmp.matches && cmp.explanations.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Nothing in our records matches this difference. Ask them for their ledger statement and compare it line by line.</p>}
        </div>
      )}
    </div>
  );
}
