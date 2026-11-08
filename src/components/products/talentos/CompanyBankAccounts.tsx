"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { addAccountAction, setSalaryAccountAction, topUpAction } from "@/app/(products)/commandos/(protected)/settings/payments/payroll-actions";

interface Account {
  _id: string;
  accountName: string;
  bankName: string;
  last4: string | null;
  ifsc: string | null;
  balance: number;
}

export default function CompanyBankAccounts({ accounts, salaryAccountId, connected, razorpayxBalance }: { accounts: Account[]; salaryAccountId: string | null; connected: boolean; razorpayxBalance: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [top, setTop] = useState({ fromAccountId: salaryAccountId ?? "", amount: "", date: new Date().toISOString().slice(0, 10), reference: "" });
  const [topError, setTopError] = useState<string | null>(null);
  const [f, setF] = useState({ accountName: "", bankName: "", accountNumber: "", ifsc: "", openingBalance: "" });

  function add() {
    start(async () => {
      const r = await addAccountAction(f);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return void toast.error(r.error ?? Object.values(r.fieldErrors ?? {})[0] ?? "Could not save.");
      }
      setErrors({});
      setF({ accountName: "", bankName: "", accountNumber: "", ifsc: "", openingBalance: "" });
      toast.success("Account added");
      router.refresh();
    });
  }
  function topUp() {
    setTopError(null);
    start(async () => {
      const r = await topUpAction(top);
      if (!r.ok) return void setTopError(r.error ?? "Could not record.");
      toast.success(r.message ?? "Recorded");
      setTop((x) => ({ ...x, amount: "", reference: "" }));
      router.refresh();
    });
  }
  function use(id: string) {
    start(async () => {
      const r = await setSalaryAccountAction(id);
      if (!r.ok) return void toast.error(r.error ?? "Could not save.");
      toast.success("Saved as the default account");
      router.refresh();
    });
  }
  const field = (label: string, k: keyof typeof f, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} />
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <GlassCard interactive={false}>
        <CardContent className="space-y-2 py-4 text-sm">
          <p className="font-semibold">How payments work</p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Every payment (salaries, vendors, refunds, reimbursements) is made by <strong>RazorpayX</strong> from your RazorpayX balance. {connected ? <span className="text-emerald-700 dark:text-emerald-400">Razorpay is connected.</span> : <>It is <strong>not connected</strong> yet: <Link className="underline" href="/commandos/settings/payments">connect Razorpay</Link>.</>}</li>
            <li>You add money to RazorpayX from your current account (net banking, to the RazorpayX account), then record it here so your books agree.</li>
            <li>Each payment shows as paid, with its UTR, when the bank confirms, and is booked against the RazorpayX balance in CashFlow.</li>
            <li>PF, ESI, tax and professional tax cannot be paid through Razorpay. Pay them on their portals from your current account and record them under <em>Government payments</em>.</li>
          </ol>
          <p className="pt-1">RazorpayX balance in your books: <strong>{formatCurrency(razorpayxBalance)}</strong></p>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm font-semibold">Record a top-up of RazorpayX</p>
          <p className="text-xs text-muted-foreground">Money you moved from a current account to your RazorpayX account. It is a transfer between your own accounts, not an expense.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>From</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={top.fromAccountId} onChange={(e) => setTop({ ...top, fromAccountId: e.target.value })}>
                <option value="">Choose the account…</option>
                {accounts.map((a) => <option key={a._id} value={a._id}>{a.accountName}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Amount (₹)</Label><Input inputMode="decimal" value={top.amount} onChange={(e) => setTop({ ...top, amount: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={top.date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setTop({ ...top, date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Bank reference (optional)</Label><Input value={top.reference} maxLength={60} onChange={(e) => setTop({ ...top, reference: e.target.value })} /></div>
          </div>
          {topError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{topError}</p>}
          <Button disabled={pending || accounts.length === 0} onClick={topUp}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Record top-up"}</Button>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm font-semibold">Your current accounts</p>
          {accounts.length === 0 && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm">No account yet. Add the company&apos;s current account below to pay salaries.</p>}
          <ul className="divide-y">
            {accounts.map((a) => (
              <li key={a._id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">{a.accountName}</p>
                  <p className="text-xs text-muted-foreground">{a.bankName}{a.last4 ? ` ••${a.last4}` : ""}{a.ifsc ? ` · ${a.ifsc}` : ""} · balance in books {formatCurrency(a.balance)}</p>
                </div>
                {salaryAccountId === a._id ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Default account</Badge> : <Button size="sm" variant="outline" disabled={pending} onClick={() => use(a._id)}>Make default</Button>}
              </li>
            ))}
          </ul>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm font-semibold">Add a current account</p>
          <p className="text-xs text-muted-foreground">The number is stored encrypted and shown only as the last four digits. The balance is what your books show today; later payments change it.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("Name", "accountName", { placeholder: "HDFC current account", maxLength: 80 })}
            {field("Bank", "bankName", { placeholder: "HDFC Bank", maxLength: 80 })}
            {field("Account number", "accountNumber", { inputMode: "numeric" })}
            {field("IFSC", "ifsc", { maxLength: 11 })}
            {field("Balance today (₹)", "openingBalance", { inputMode: "decimal" })}
          </div>
          <Button disabled={pending} onClick={add}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Add account"}</Button>
        </CardContent>
      </GlassCard>
    </div>
  );
}
