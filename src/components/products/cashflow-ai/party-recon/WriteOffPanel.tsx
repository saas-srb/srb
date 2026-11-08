"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveWriteOffAction, proposeWriteOffAction, withdrawWriteOffAction } from "@/app/(products)/cashflow-ai/(protected)/party-reconciliation/actions";

const field = "h-9 rounded-lg border border-border bg-background px-2 text-sm";

export function ProposeWriteOffForm({
  kind,
  partyId,
  items,
}: {
  kind: "customer" | "vendor";
  partyId: string;
  /** Open items that can still take a write-off, with what is left on each. */
  items: { docId: string; number: string; room: number }[];
}) {
  const [docId, setDocId] = useState(items[0]?.docId ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing is open that could be written off.</p>;
  const word = kind === "customer" ? "invoice" : "bill";
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const res = await proposeWriteOffAction({ kind, partyId, docId, amount, reason });
            if (!res.ok) toast.error(res.error);
            else {
              toast.success("Proposed. Someone else must approve it.");
              setAmount("");
              setReason("");
            }
          } catch {
            toast.error("Could not save. Please try again.");
          }
        });
      }}
    >
      <label className="text-xs text-muted-foreground">Which {word}
        <select value={docId} onChange={(e) => setDocId(e.target.value)} className={`${field} mt-1 w-full`}>
          {items.map((i) => <option key={i.docId} value={i.docId}>{i.number} (up to ₹{i.room.toLocaleString("en-IN", { minimumFractionDigits: 2 })})</option>)}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">Amount (₹)<input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} maxLength={20} className={`${field} mt-1 w-full`} /></label>
      <label className="text-xs text-muted-foreground sm:col-span-2">Why<input required value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={500} placeholder="e.g. Customer closed down, no reply to 4 reminders" className={`${field} mt-1 w-full`} /></label>
      <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" size="sm" disabled={pending}>Add to the register</Button></div>
    </form>
  );
}

export function WriteOffRowActions({
  id,
  status,
  proposedByMe,
  canApprove,
  canManage,
}: {
  id: string;
  status: "proposed" | "approved";
  proposedByMe: boolean;
  canApprove: boolean;
  canManage: boolean;
}) {
  const [done, setDone] = useState<"approved" | "withdrawn" | null>(null);
  const [pending, start] = useTransition();
  if (status === "approved" || done === "approved") return null;
  if (done === "withdrawn") return <span className="text-xs text-muted-foreground">Withdrawn</span>;

  function run(kind: "approved" | "withdrawn", fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) toast.error(res.error ?? "Could not save.");
        else {
          setDone(kind); // shown at once; the page refresh that follows replaces it with the saved row
          toast.success(msg);
        }
      } catch {
        toast.error("Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canApprove && !proposedByMe && <Button size="xs" disabled={pending} onClick={() => run("approved", () => approveWriteOffAction(id), "Approved")}>Approve</Button>}
      {canApprove && proposedByMe && <span className="text-xs text-muted-foreground">Someone else must approve</span>}
      {canManage && <Button size="xs" variant="ghost" disabled={pending} onClick={() => { if (confirm("Take this proposal back?")) run("withdrawn", () => withdrawWriteOffAction(id), "Withdrawn"); }}>Withdraw</Button>}
    </div>
  );
}
