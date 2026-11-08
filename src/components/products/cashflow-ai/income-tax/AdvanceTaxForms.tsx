"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelTaxPaymentAction, recordTaxPaymentAction, saveScheduleAction } from "@/app/(products)/cashflow-ai/(protected)/income-tax/advance-tax/actions";

const field = "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm";
const label = "block text-xs text-muted-foreground";

export function ScheduleEditor({ fy, initial, note, estimate, confirmed, canEdit }: { fy: string; initial: { dueDate: string; percent: string }[]; note: string; estimate: string; confirmed: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(initial.length ? initial : [{ dueDate: "", percent: "" }]);
  const [v, setV] = useState({ note, estimate, confirmed });
  const setRow = (i: number, k: "dueDate" | "percent", val: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await saveScheduleAction({ fy, instalments: rows.filter((x) => x.dueDate || x.percent), ...v });
            if (r.ok) toast.success("Schedule saved");
            else toast.error(r.error);
          } catch {
            toast.error("Could not save the schedule. Please try again.");
          }
        });
      }}
    >
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <label className={label}>Due date<input type="date" disabled={!canEdit} value={r.dueDate} onChange={(e) => setRow(i, "dueDate", e.target.value)} className={`${field} mt-1 w-40`} /></label>
            <label className={label}>Share of the year&apos;s tax to be paid by then (%)<input inputMode="decimal" disabled={!canEdit} value={r.percent} onChange={(e) => setRow(i, "percent", e.target.value)} className={`${field} mt-1 w-40`} /></label>
            {canEdit && <Button type="button" size="sm" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</Button>}
          </div>
        ))}
        {canEdit && rows.length < 12 && <Button type="button" size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, { dueDate: "", percent: "" }])}>Add an instalment</Button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Tax to plan for, if you want to set it yourself (₹, optional)<input inputMode="decimal" disabled={!canEdit} value={v.estimate} onChange={(e) => setV((s) => ({ ...s, estimate: e.target.value }))} className={`${field} mt-1`} /></label>
        <label className={label}>Note (optional)<input maxLength={500} disabled={!canEdit} value={v.note} onChange={(e) => setV((s) => ({ ...s, note: e.target.value }))} className={`${field} mt-1`} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canEdit} checked={v.confirmed} onChange={(e) => setV((s) => ({ ...s, confirmed: e.target.checked }))} /> My CA has confirmed these dates and percentages</label>
      {canEdit && <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save schedule"}</Button>}
    </form>
  );
}

export function RecordTaxPaymentForm({ fy, banks, kinds, today }: { fy: string; banks: { id: string; name: string }[]; kinds: { value: string; label: string }[]; today: string }) {
  const [pending, start] = useTransition();
  const [v, setV] = useState({ fy, kind: kinds[0]?.value ?? "advance", amount: "", paidOn: today, bsrCode: "", serial: "", bankAccountId: banks.length === 1 ? banks[0].id : "", note: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await recordTaxPaymentAction({ ...v, fy });
            if (r.ok) {
              toast.success(r.message);
              setV((s) => ({ ...s, amount: "", bsrCode: "", serial: "", note: "" }));
            } else toast.error(r.error);
          } catch {
            toast.error("Could not save the payment. Please try again.");
          }
        });
      }}
    >
      <label className={label}>Kind of tax<select required value={v.kind} onChange={set("kind")} className={`${field} mt-1`}>{kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
      <label className={label}>Amount paid (₹)<input required inputMode="decimal" value={v.amount} onChange={set("amount")} className={`${field} mt-1`} /></label>
      <label className={label}>Date paid<input required type="date" max={today} value={v.paidOn} onChange={set("paidOn")} className={`${field} mt-1`} /></label>
      <label className={label}>Paid from<select required value={v.bankAccountId} onChange={set("bankAccountId")} className={`${field} mt-1`}><option value="" disabled>Bank account…</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className={label}>Bank BSR code (7 digits)<input required inputMode="numeric" maxLength={7} value={v.bsrCode} onChange={set("bsrCode")} className={`${field} mt-1`} /></label>
      <label className={label}>Challan serial number<input required inputMode="numeric" maxLength={5} value={v.serial} onChange={set("serial")} className={`${field} mt-1`} /></label>
      <label className={`${label} sm:col-span-2`}>Note (optional)<input maxLength={300} value={v.note} onChange={set("note")} className={`${field} mt-1`} /></label>
      <div className="flex items-end"><Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Record payment"}</Button></div>
    </form>
  );
}

export function CancelTaxPaymentButton({ id }: { id: string }) {
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
              const r = await cancelTaxPaymentAction(id, reason);
              if (r.ok) toast.success("Payment cancelled");
              else toast.error(r.error);
            } catch {
              toast.error("Could not cancel. Please try again.");
            }
          })
        }
      >
        {pending ? "Cancelling…" : "Cancel payment"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Keep it</Button>
    </div>
  );
}
