"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adjustAdvanceAction, createAdvanceAction, refundAdvanceAction } from "@/app/(products)/cashflow-ai/(protected)/vendor-controls/actions";

const field = "h-9 rounded-lg border border-border bg-background px-2 text-sm";

export function NewAdvanceForm({ vendors, today }: { vendors: { id: string; name: string }[]; today: string }) {
  const [v, setV] = useState({ vendorId: "", kind: "advance", amount: "", paidOn: today, purpose: "", reference: "" });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await createAdvanceAction(v);
            if (r.ok) {
              toast.success("Recorded");
              setV((s) => ({ ...s, amount: "", purpose: "", reference: "" }));
            } else toast.error(r.error);
          } catch {
            toast.error("Could not save. Please try again.");
          }
        });
      }}
    >
      <label className="text-xs text-muted-foreground">Vendor
        <select required value={v.vendorId} onChange={(e) => set("vendorId", e.target.value)} className={`${field} mt-1 block max-w-56`}>
          <option value="" disabled>Choose…</option>
          {vendors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">Type
        <select value={v.kind} onChange={(e) => set("kind", e.target.value)} className={`${field} mt-1 block`}>
          <option value="advance">Advance</option>
          <option value="deposit">Security deposit</option>
        </select>
      </label>
      <label className="text-xs text-muted-foreground">Amount (₹)<input required inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value)} className={`${field} mt-1 block w-32`} /></label>
      <label className="text-xs text-muted-foreground">Date paid<input required type="date" max={today} value={v.paidOn} onChange={(e) => set("paidOn", e.target.value)} className={`${field} mt-1 block`} /></label>
      <label className="min-w-48 flex-1 text-xs text-muted-foreground">What it is for<input required minLength={3} maxLength={300} value={v.purpose} onChange={(e) => set("purpose", e.target.value)} className={`${field} mt-1 block w-full`} /></label>
      <label className="text-xs text-muted-foreground">Payment reference (optional)<input maxLength={80} value={v.reference} onChange={(e) => set("reference", e.target.value)} className={`${field} mt-1 block w-40`} /></label>
      <Button type="submit" size="sm" disabled={pending || !v.vendorId}>{pending ? "Saving…" : "Record"}</Button>
    </form>
  );
}

export function AdjustAdvanceForm({ advanceId, remaining, bills }: { advanceId: string; remaining: number; bills: { id: string; number: string; outstanding: number }[] }) {
  const [bill, setBill] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  if (bills.length === 0) return <span className="text-xs text-muted-foreground">No unpaid bill from this vendor to adjust against.</span>;
  const chosen = bills.find((b) => b.id === bill);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await adjustAdvanceAction(advanceId, bill, amount);
            if (r.ok) {
              toast.success("Adjusted against the bill");
              setAmount("");
            } else toast.error(r.error);
          } catch {
            toast.error("Could not save. Please try again.");
          }
        });
      }}
    >
      <select aria-label="Bill to adjust against" required value={bill} onChange={(e) => {
        setBill(e.target.value);
        const b = bills.find((x) => x.id === e.target.value);
        if (b) setAmount(String(Math.min(b.outstanding, remaining)));
      }} className={field}>
        <option value="" disabled>Adjust against bill…</option>
        {bills.map((b) => <option key={b.id} value={b.id}>{b.number} (owed ₹{b.outstanding.toLocaleString("en-IN")})</option>)}
      </select>
      <input aria-label="Amount to adjust" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} w-28`} />
      <Button type="submit" size="sm" disabled={pending || !chosen}>{pending ? "Saving…" : "Adjust"}</Button>
    </form>
  );
}

export function RefundAdvanceForm({ advanceId, today }: { advanceId: string; today: string }) {
  const [on, setOn] = useState(today);
  const [note, setNote] = useState("");
  const [shown, setShown] = useState(false);
  const [pending, start] = useTransition();
  if (!shown) return <Button size="sm" variant="outline" onClick={() => setShown(true)}>Vendor refunded it</Button>;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await refundAdvanceAction(advanceId, on, note);
            if (r.ok) toast.success("Marked as refunded");
            else toast.error(r.error);
          } catch {
            toast.error("Could not save. Please try again.");
          }
        });
      }}
    >
      <input aria-label="Date refunded" required type="date" max={today} value={on} onChange={(e) => setOn(e.target.value)} className={field} />
      <input aria-label="Note" maxLength={300} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className={`${field} w-44`} />
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
    </form>
  );
}
