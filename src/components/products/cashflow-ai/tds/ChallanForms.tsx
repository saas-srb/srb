"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelChallanAction, recordChallanAction } from "@/app/(products)/cashflow-ai/(protected)/tds/challans/actions";

const field = "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm";
const label = "block text-xs text-muted-foreground";

export function RecordChallanForm({ months, banks, sections, defaultMonth, today }: { months: { value: string; label: string }[]; banks: { id: string; name: string }[]; sections: string[]; defaultMonth: string; today: string }) {
  const [pending, start] = useTransition();
  const [v, setV] = useState({ forMonth: defaultMonth, amount: "", paidOn: today, bsrCode: "", serial: "", cin: "", section: "", bankAccountId: banks.length === 1 ? banks[0].id : "", note: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await recordChallanAction(v);
            if (r.ok) {
              toast.success(r.message);
              setV((s) => ({ ...s, amount: "", bsrCode: "", serial: "", cin: "", note: "" }));
            } else toast.error(r.error);
          } catch {
            toast.error("Could not save the challan. Please try again.");
          }
        });
      }}
    >
      <label className={label}>Tax is for the month<select required value={v.forMonth} onChange={set("forMonth")} className={`${field} mt-1`}>{months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
      <label className={label}>Amount deposited (₹)<input required inputMode="decimal" value={v.amount} onChange={set("amount")} className={`${field} mt-1`} /></label>
      <label className={label}>Date deposited<input required type="date" max={today} value={v.paidOn} onChange={set("paidOn")} className={`${field} mt-1`} /></label>
      <label className={label}>Paid from<select required value={v.bankAccountId} onChange={set("bankAccountId")} className={`${field} mt-1`}><option value="" disabled>Bank account…</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className={label}>Bank BSR code (7 digits)<input required inputMode="numeric" maxLength={7} value={v.bsrCode} onChange={set("bsrCode")} className={`${field} mt-1`} /></label>
      <label className={label}>Challan serial number<input required inputMode="numeric" maxLength={5} value={v.serial} onChange={set("serial")} className={`${field} mt-1`} /></label>
      <label className={label}>Section (optional)<select value={v.section} onChange={set("section")} className={`${field} mt-1`}><option value="">Not stated</option>{sections.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      <label className={label}>CIN (optional)<input maxLength={40} value={v.cin} onChange={set("cin")} className={`${field} mt-1`} /></label>
      <label className={`${label} sm:col-span-2 lg:col-span-3`}>Note (optional)<input maxLength={300} value={v.note} onChange={set("note")} className={`${field} mt-1`} /></label>
      <div className="flex items-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Record challan"}</Button></div>
    </form>
  );
}

export function CancelChallanButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Cancel</Button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label="Why is it being cancelled" placeholder="Why is it cancelled?" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className={`${field} w-56`} />
      <Button
        size="sm"
        disabled={pending || reason.trim().length < 3}
        onClick={() =>
          start(async () => {
            try {
              const r = await cancelChallanAction(id, reason);
              if (r.ok) toast.success("Challan cancelled");
              else toast.error(r.error);
            } catch {
              toast.error("Could not cancel. Please try again.");
            }
          })
        }
      >
        {pending ? "Cancelling…" : "Cancel challan"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Keep it</Button>
    </div>
  );
}
