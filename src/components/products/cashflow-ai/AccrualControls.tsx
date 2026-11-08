"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { activateAccrualAction, postMissingAccrualsAction } from "@/app/(products)/cashflow-ai/(protected)/settings/accrual/actions";

const field = "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm";

export function ActivateAccrualForm({ incomeAccounts, expenseAccounts }: { incomeAccounts: { id: string; label: string }[]; expenseAccounts: { id: string; label: string }[] }) {
  const [revenue, setRevenue] = useState("");
  const [expense, setExpense] = useState("");
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await activateAccrualAction(revenue, expense);
            if (r.ok) toast.success(r.message);
            else toast.error(r.error);
          } catch {
            toast.error("Could not switch on accrual books. Please try again.");
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Where should sales revenue be booked?
          <select required value={revenue} onChange={(e) => setRevenue(e.target.value)} className={`${field} mt-1`}>
            <option value="" disabled>Choose an income account…</option>
            {incomeAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Where should vendor-bill costs be booked?
          <select required value={expense} onChange={(e) => setExpense(e.target.value)} className={`${field} mt-1`}>
            <option value="" disabled>Choose an expense account…</option>
            {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-1" />
        <span>I understand this starts today and cannot be switched off. My CA has seen the opening balances below.</span>
      </label>
      <Button type="submit" disabled={pending || !sure || !revenue || !expense}>{pending ? "Switching on…" : "Switch on accrual books"}</Button>
    </form>
  );
}

export function PostMissingButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const r = await postMissingAccrualsAction();
            if (r.ok) toast.success(r.message);
            else toast.error(r.error);
          } catch {
            toast.error("Could not post. Please try again.");
          }
        })
      }
    >
      {pending ? "Posting…" : "Post what is missing"}
    </Button>
  );
}
