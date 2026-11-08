"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bookSettlementAction, syncSettlementsAction } from "@/app/(products)/cashflow-ai/(protected)/settlements/actions";

const field = "h-9 rounded-lg border border-border bg-background px-2 text-sm";

export function SyncSettlementsForm({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await syncSettlementsAction(from, to);
            if (r.ok) toast.success(r.message);
            else toast.error(r.error);
          } catch {
            toast.error("Could not reach Razorpay. Please try again.");
          }
        });
      }}
    >
      <label className="text-xs text-muted-foreground">From<input type="date" required value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${field} mt-1 block`} /></label>
      <label className="text-xs text-muted-foreground">To<input type="date" required value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${field} mt-1 block`} /></label>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Reading from Razorpay…" : "Get settlements from Razorpay"}</Button>
      <span className="text-xs text-muted-foreground">Up to 31 days at a time.</span>
    </form>
  );
}

export function BookSettlementForm({ id, banks, defaultBankId }: { id: string; banks: { id: string; name: string }[]; defaultBankId: string }) {
  const [bank, setBank] = useState(defaultBankId);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Bank account the money arrived in" value={bank} onChange={(e) => setBank(e.target.value)} className={field}>
        <option value="" disabled>Bank account…</option>
        {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <Button
        size="sm"
        disabled={pending || !bank}
        onClick={() =>
          start(async () => {
            try {
              const r = await bookSettlementAction(id, bank);
              if (r.ok) toast.success("Settlement booked");
              else toast.error(r.error);
            } catch {
              toast.error("Could not book. Please try again.");
            }
          })
        }
      >
        {pending ? "Booking…" : "Book it"}
      </Button>
    </div>
  );
}
