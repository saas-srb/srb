"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCurrency, formatDate } from "@/lib/utils";
import { monthLabelLong } from "@/lib/products/talentos/payroll-status";
import type { Due, DueStatus } from "@/lib/products/talentos/payroll/dues";
import { deletePaymentAction, recordPaymentAction } from "@/app/(products)/talentos/(protected)/(staff)/payroll/compliance/actions";

const statusUi: Record<DueStatus, [string, string]> = {
  paid: ["Paid", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"],
  part_paid: ["Part paid", "bg-amber-500/15 text-amber-700 dark:text-amber-400"],
  due: ["Due", "bg-sky-500/15 text-sky-700 dark:text-sky-400"],
  overdue: ["Overdue", "bg-destructive/15 text-destructive"],
  nothing_due: ["Nothing due", "bg-muted text-muted-foreground"],
};
const FILE: Record<string, [string, string]> = { pf: ["pf-ecr", "ECR file"], esi: ["esi", "ESI file"], tds: ["tds", "TDS register"], pt: ["pt", "PT report"] };

export default function StatutoryDues({
  month,
  runId,
  dues,
  overview,
  deadlines,
  accounts,
  defaultAccountId,
}: {
  month: string;
  runId: string | null;
  dues: Due[];
  overview: { month: string; open: number; overdue: number; total: number }[];
  deadlines: { date: string; title: string; detail: string }[];
  accounts: { _id: string; label: string; balance: number }[];
  defaultAccountId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<Due | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [f, setF] = useState({ accountId: defaultAccountId ?? "", amount: "", paidOn: new Date().toISOString().slice(0, 10), reference: "", bsrCode: "", challanSerial: "", note: "" });

  function open(d: Due) {
    setTarget(d);
    setErrors({});
    setF((x) => ({ accountId: x.accountId, amount: String(d.balance), paidOn: new Date().toISOString().slice(0, 10), reference: "", bsrCode: "", challanSerial: "", note: "" }));
  }
  function save() {
    if (!target) return;
    start(async () => {
      const r = await recordPaymentAction({ ...f, month, kind: target.kind, state: target.state });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return void toast.error(r.error ?? Object.values(r.fieldErrors ?? {})[0] ?? "Could not record.");
      }
      toast.success("Payment recorded");
      setTarget(null);
      router.refresh();
    });
  }
  function remove(id: string) {
    start(async () => {
      const r = await deletePaymentAction(id);
      if (!r.ok) return void toast.error(r.error ?? "Could not remove.");
      toast.success("Payment removed");
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
        <CardContent className="space-y-3 py-4">
          <p className="text-sm text-muted-foreground">Amounts come from the approved payroll run. Pay on the government portals or through your bank, then record the challan here so the books show what is paid and what is late.</p>
          <div className="flex flex-wrap gap-2">
            {overview.length === 0 && <p className="text-sm">No approved payroll run yet.</p>}
            {overview.map((o) => (
              <a key={o.month} href={`/talentos/payroll/compliance?month=${o.month}`} className={`rounded-md border px-3 py-1.5 text-sm hover:bg-muted ${o.month === month ? "border-primary bg-primary/5" : ""}`}>
                {monthLabelLong(o.month)} {o.overdue > 0 ? <Badge className="ml-1 bg-destructive/15 text-destructive">{o.overdue} overdue</Badge> : o.open > 0 ? <Badge className="ml-1 bg-amber-500/15 text-amber-700 dark:text-amber-400">{o.open} to pay</Badge> : <Badge className="ml-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">All paid</Badge>}
              </a>
            ))}
          </div>
        </CardContent>
      </GlassCard>

      {runId && (
        <div className="grid gap-4 lg:grid-cols-2">
          {dues.filter((d) => d.status !== "nothing_due").map((d) => (
            <GlassCard key={d.key} interactive={false}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{d.label}</p>
                    <p className="text-xs text-muted-foreground">{d.dueDate ? `Due ${formatDate(d.dueDate)}` : "Due date set by the state"}</p>
                  </div>
                  <Badge className={statusUi[d.status][1]}>{statusUi[d.status][0]}</Badge>
                </div>
                <p className="text-2xl font-bold tabular-nums">{formatCurrency(d.amount)}</p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {d.breakdown.map((b) => <li key={b.label} className="flex justify-between"><span>{b.label}</span><span className="tabular-nums">{formatCurrency(b.amount)}</span></li>)}
                </ul>
                {d.payments.length > 0 && (
                  <ul className="divide-y rounded-md border text-xs">
                    {d.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <span>{formatCurrency(p.amount)} on {formatDate(p.paidOn)} · ref {p.reference}{p.accountLabel ? ` · from ${p.accountLabel}` : ""}{p.bsrCode ? ` · BSR ${p.bsrCode}/${p.challanSerial}` : ""}</span>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(p.id)}>Remove</Button>
                      </li>
                    ))}
                  </ul>
                )}
                {d.status === "overdue" && d.interestEstimate !== null && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">Paying late costs interest of 1.5% for each month or part of a month. About {formatCurrency(d.interestEstimate)} so far (an estimate; pay it with the challan).</p>}
                {d.status === "paid" && d.interestEstimate !== null && d.interestEstimate > 0 && d.payments.some((p) => d.dueDate && p.paidOn > d.dueDate) && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs">This was paid after the due date. Interest of about {formatCurrency(d.interestEstimate)} is payable.</p>}
                {d.status === "overdue" && d.kind !== "tds" && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">Past the due date. Interest and damages can apply; pay at once.</p>}
                {d.note && <p className="text-xs text-muted-foreground">{d.note}</p>}
                <div className="flex flex-wrap gap-2">
                  {d.balance > 0 && <Button size="sm" onClick={() => open(d)}>Record payment</Button>}
                  {FILE[d.kind] && (
                    <a href={`/api/talentos/payroll/runs/${runId}/export/${FILE[d.kind][0]}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted"><Download className="size-3.5" />{FILE[d.kind][1]}</a>
                  )}
                </div>
              </CardContent>
            </GlassCard>
          ))}
          {dues.every((d) => d.status === "nothing_due") && <p className="text-sm text-muted-foreground">Nothing was deducted or is due for this month.</p>}
        </div>
      )}

      <GlassCard interactive={false}>
        <CardContent className="space-y-2 py-4">
          <p className="text-sm font-semibold">Coming up: returns and certificates</p>
          <ul className="space-y-1 text-sm">
            {deadlines.map((d) => <li key={d.date + d.title}><span className="font-medium">{formatDate(d.date)}</span> · {d.title}<span className="block text-xs text-muted-foreground">{d.detail}</span></li>)}
          </ul>
          <p className="text-xs text-muted-foreground">Payments are recorded against your company account and posted to its books in CashFlow. The TDS return must be filed in the government&apos;s format (checked by the File Validation Utility) on the TIN-NSDL portal; use the TDS register and the challans recorded here to prepare it. A late return costs ₹200 a day.</p>
        </CardContent>
      </GlassCard>

      <Sheet open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60"><SheetTitle>Record payment</SheetTitle><SheetDescription>{target?.label} for {monthLabelLong(month)}. Still unpaid: {target ? formatCurrency(target.balance) : ""}.</SheetDescription></SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>Paid from (company account)</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
                <option value="">Choose the account…</option>
                {accounts.map((a) => <option key={a._id} value={a._id}>{a.label}</option>)}
              </select>
              {accounts.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-400">No account yet. <Link className="underline" href="/commandos/settings/payments#payroll-bank">Add your current account</Link> first.</p>}
              {errors.accountId && <p className="text-xs text-destructive">{errors.accountId}</p>}
            </div>
            {field("Amount paid (₹)", "amount", { inputMode: "numeric" })}
            {field("Date paid", "paidOn", { type: "date" })}
            {field(target?.kind === "pf" ? "TRRN / challan number" : target?.kind === "tds" ? "CIN or challan identification" : "Challan or receipt number", "reference")}
            {target?.kind === "tds" && field("Bank BSR code (7 digits)", "bsrCode", { inputMode: "numeric", maxLength: 7 })}
            {target?.kind === "tds" && field("Challan serial number", "challanSerial", { inputMode: "numeric" })}
            {field("Note (optional)", "note", { maxLength: 300 })}
            <Button className="w-full" disabled={pending} onClick={save}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Record payment"}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
