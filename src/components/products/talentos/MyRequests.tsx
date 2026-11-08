"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EXPENSE_CATEGORIES } from "@/lib/products/talentos/work-request-rules";
import { formatCurrency, formatDate } from "@/lib/utils";
import { requestExpenseAction, requestOvertimeAction, requestShortLeaveAction, withdrawMyRequestAction, type RequestResult } from "@/app/(products)/talentos/(protected)/me/requests/actions";

export interface MyRequestRow {
  _id: string;
  kind: "overtime" | "short_leave" | "expense";
  date: string;
  month: string;
  minutes: number;
  fromTime: string | null;
  toTime: string | null;
  title: string | null;
  vendor: string | null;
  billNumber: string | null;
  category: string | null;
  amount: number;
  approvedAmount: number | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string;
  decisionNote: string | null;
}

const statusClass: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};
const hours = (m: number) => `${Math.round((m / 60) * 100) / 100} h`;
const today = () => new Date().toISOString().slice(0, 10);
const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export default function MyRequests({
  rows,
  limits,
  usage,
  month,
}: {
  rows: MyRequestRow[];
  limits: { overtimeEnabled: boolean; overtimeMaxMinutesPerDay: number; overtimeMaxMinutesPerMonth: number; shortLeavesPerMonth: number; shortLeaveMaxMinutes: number; expenseMaxAgeDays: number };
  usage: { overtimeMinutes: number; shortLeaves: number };
  month: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState<"overtime" | "short" | "expense" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ot, setOt] = useState({ date: today(), hours: "1", reason: "" });
  const [sl, setSl] = useState({ date: today(), fromTime: "10:00", toTime: "12:00", reason: "" });
  const [ex, setEx] = useState({ category: "asset", title: "", vendor: "", billNumber: "", billDate: today(), amount: "", reason: "" });

  function send(fn: () => Promise<RequestResult>, ok: string) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? "Could not send.");
        return;
      }
      toast.success(ok);
      setSheet(null);
      router.refresh();
    });
  }
  function withdraw(id: string) {
    start(async () => {
      const r = await withdrawMyRequestAction(id);
      if (!r.ok) return void toast.error(r.error ?? "Could not withdraw.");
      toast.success("Withdrawn");
      router.refresh();
    });
  }

  const list = (kind: MyRequestRow["kind"], empty: string) => {
    const mine = rows.filter((r) => r.kind === kind);
    if (mine.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
    return (
      <ul className="divide-y">
        {mine.map((r) => (
          <li key={r._id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">
                {kind === "overtime" && `${hours(r.minutes)} on ${formatDate(r.date)}`}
                {kind === "short_leave" && `${formatDate(r.date)}, ${r.fromTime} to ${r.toTime}`}
                {kind === "expense" && `${r.title} · ${formatCurrency(r.amount)}`}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {kind === "expense" ? `${r.vendor}, bill ${r.billNumber}, ${formatDate(r.date)}. ` : ""}
                {r.reason}
                {r.status === "approved" && kind === "expense" && r.approvedAmount !== null ? ` Approved ${formatCurrency(r.approvedAmount)}, paid with ${r.month} salary.` : ""}
                {r.decisionNote ? ` Note: ${r.decisionNote}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={statusClass[r.status]}>{r.status}</Badge>
              {(r.status === "pending" || r.status === "approved") && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => withdraw(r._id)}>Withdraw</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const err = error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>;
  const text = (label: string, value: string, onChange: (v: string) => void, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} {...props} />
    </div>
  );

  return (
    <>
      <Tabs defaultValue="overtime" className="gap-4">
        <TabsList>
          <TabsTrigger value="overtime">Overtime</TabsTrigger>
          <TabsTrigger value="short">Partial leave</TabsTrigger>
          <TabsTrigger value="expense">Expense claims</TabsTrigger>
        </TabsList>

        <TabsContent value="overtime">
          <GlassCard interactive={false}>
            <CardContent className="space-y-2 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {limits.overtimeEnabled
                    ? `Worked beyond your hours or on a day off? Ask for it once the work is done. Used this month (${month}): ${hours(usage.overtimeMinutes)} of ${hours(limits.overtimeMaxMinutesPerMonth)}.`
                    : "Your company does not pay overtime."}
                </p>
                {limits.overtimeEnabled && <Button size="sm" onClick={() => { setError(null); setSheet("overtime"); }}><Plus className="size-3.5" data-icon="inline-start" />Request overtime</Button>}
              </div>
              {list("overtime", "No overtime requests.")}
            </CardContent>
          </GlassCard>
        </TabsContent>

        <TabsContent value="short">
          <GlassCard interactive={false}>
            <CardContent className="space-y-2 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {limits.shortLeavesPerMonth > 0
                    ? `A few hours off in a day (up to ${hours(limits.shortLeaveMaxMinutes)}). It is paid and uses no leave balance. This month: ${usage.shortLeaves} of ${limits.shortLeavesPerMonth} used.`
                    : "Your company does not offer partial leave."}
                </p>
                {limits.shortLeavesPerMonth > 0 && <Button size="sm" disabled={usage.shortLeaves >= limits.shortLeavesPerMonth} onClick={() => { setError(null); setSheet("short"); }}><Plus className="size-3.5" data-icon="inline-start" />Apply</Button>}
              </div>
              {list("short_leave", "No partial leaves.")}
            </CardContent>
          </GlassCard>
        </TabsContent>

        <TabsContent value="expense">
          <GlassCard interactive={false}>
            <CardContent className="space-y-2 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Paid for something you needed for work (equipment, a subscription, internet, travel)? Claim it back against the bill within {limits.expenseMaxAgeDays} days. Keep the bill: HR may ask for it.</p>
                <Button size="sm" onClick={() => { setError(null); setSheet("expense"); }}><Plus className="size-3.5" data-icon="inline-start" />New claim</Button>
              </div>
              {list("expense", "No claims.")}
            </CardContent>
          </GlassCard>
        </TabsContent>
      </Tabs>

      <Sheet open={sheet === "overtime"} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60"><SheetTitle>Request overtime</SheetTitle><SheetDescription>Up to {hours(limits.overtimeMaxMinutesPerDay)} for a day. Paid at the company&apos;s overtime rate once a manager approves.</SheetDescription></SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {text("Day you worked", ot.date, (v) => setOt({ ...ot, date: v }), { type: "date", max: today() })}
            {text("Extra hours worked", ot.hours, (v) => setOt({ ...ot, hours: v }), { inputMode: "decimal" })}
            {text("What was the work?", ot.reason, (v) => setOt({ ...ot, reason: v }), { maxLength: 300 })}
            {err}
            <Button className="w-full" disabled={pending} onClick={() => send(() => requestOvertimeAction(ot), "Overtime requested")}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Send"}</Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "short"} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60"><SheetTitle>Partial leave</SheetTitle><SheetDescription>Time off during a working day. For a half-day or longer, apply for leave instead.</SheetDescription></SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {text("Day", sl.date, (v) => setSl({ ...sl, date: v }), { type: "date" })}
            <div className="grid grid-cols-2 gap-3">
              {text("From", sl.fromTime, (v) => setSl({ ...sl, fromTime: v }), { type: "time" })}
              {text("To", sl.toTime, (v) => setSl({ ...sl, toTime: v }), { type: "time" })}
            </div>
            {text("Reason", sl.reason, (v) => setSl({ ...sl, reason: v }), { maxLength: 300 })}
            {err}
            <Button className="w-full" disabled={pending} onClick={() => send(() => requestShortLeaveAction(sl), "Partial leave requested")}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Send"}</Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={sheet === "expense"} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60"><SheetTitle>Claim an expense</SheetTitle><SheetDescription>Repaid with your salary once approved. It is not taxed: it returns money you spent for the company. Equipment you claim stays the company&apos;s property.</SheetDescription></SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>What was it for?</Label>
              <select className={selectCls} value={ex.category} onChange={(e) => setEx({ ...ex, category: e.target.value })}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {text("What did you buy?", ex.title, (v) => setEx({ ...ex, title: v }), { maxLength: 120 })}
            {text("Paid to (shop or seller)", ex.vendor, (v) => setEx({ ...ex, vendor: v }), { maxLength: 120 })}
            <div className="grid grid-cols-2 gap-3">
              {text("Bill number", ex.billNumber, (v) => setEx({ ...ex, billNumber: v }), { maxLength: 60 })}
              {text("Bill date", ex.billDate, (v) => setEx({ ...ex, billDate: v }), { type: "date", max: today() })}
            </div>
            {text("Amount on the bill (₹)", ex.amount, (v) => setEx({ ...ex, amount: v }), { inputMode: "decimal" })}
            {text("Why was it needed for work?", ex.reason, (v) => setEx({ ...ex, reason: v }), { maxLength: 300 })}
            {err}
            <Button className="w-full" disabled={pending} onClick={() => send(() => requestExpenseAction(ex), "Claim sent")}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Send claim"}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
