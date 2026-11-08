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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EXPENSE_CATEGORIES } from "@/lib/products/talentos/work-request-rules";
import { formatCurrency, formatDate } from "@/lib/utils";
import PaymentCodeField from "@/components/products/cashflow-ai/PaymentCodeField";
import { decideRequestAction } from "@/app/(products)/talentos/(protected)/(staff)/requests/actions";
import type { MyRequestRow } from "./MyRequests";

export interface QueueRow extends MyRequestRow {
  employeeName: string;
  employeeCode: string;
  canDecide: boolean;
}

const hours = (m: number) => `${Math.round((m / 60) * 100) / 100} h`;
const statusClass: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export default function RequestsQueue({ rows, defaultPayMonth }: { rows: QueueRow[]; defaultPayMonth: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<QueueRow | null>(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [payMonth, setPayMonth] = useState(defaultPayMonth);
  const [payNow, setPayNow] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function show(r: QueueRow) {
    setOpen(r);
    setNote("");
    setAmount(String(r.amount));
    setPayMonth(defaultPayMonth);
    setPayNow(false);
    setCode("");
    setError(null);
  }
  function decide(decision: "approved" | "rejected") {
    if (!open) return;
    setError(null);
    start(async () => {
      const r = await decideRequestAction(open._id, decision, note, open.kind === "expense" && decision === "approved" ? { approvedAmount: Number(amount), payMonth, payNow, code } : {});
      if (!r.ok) return void setError(r.error ?? "Could not save.");
      toast.success(decision === "approved" ? "Approved" : "Rejected");
      setOpen(null);
      router.refresh();
    });
  }

  const describe = (r: QueueRow) =>
    r.kind === "overtime" ? `${hours(r.minutes)} overtime on ${formatDate(r.date)}` : r.kind === "short_leave" ? `Partial leave ${r.fromTime} to ${r.toTime} on ${formatDate(r.date)}` : `${r.title}: ${formatCurrency(r.amount)}`;

  const table = (kind: QueueRow["kind"]) => {
    const list = rows.filter((r) => r.kind === kind);
    if (list.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nothing here.</p>;
    return (
      <ul className="divide-y">
        {list.map((r) => (
          <li key={r._id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{r.employeeName} <span className="text-xs font-normal text-muted-foreground">{r.employeeCode}</span></p>
              <p className="truncate text-xs text-muted-foreground">{describe(r)}. {r.reason}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={statusClass[r.status]}>{r.status}</Badge>
              {r.status === "pending" && r.canDecide && <Button size="sm" variant="outline" onClick={() => show(r)}>Review</Button>}
            </div>
          </li>
        ))}
      </ul>
    );
  };

  const pendingCount = (k: QueueRow["kind"]) => rows.filter((r) => r.kind === k && r.status === "pending").length;

  return (
    <>
      <Tabs defaultValue="overtime" className="gap-4">
        <TabsList>
          <TabsTrigger value="overtime">Overtime ({pendingCount("overtime")})</TabsTrigger>
          <TabsTrigger value="short_leave">Partial leave ({pendingCount("short_leave")})</TabsTrigger>
          <TabsTrigger value="expense">Expense claims ({pendingCount("expense")})</TabsTrigger>
        </TabsList>
        {(["overtime", "short_leave", "expense"] as const).map((k) => (
          <TabsContent key={k} value={k}>
            <GlassCard interactive={false}><CardContent className="py-3">{table(k)}</CardContent></GlassCard>
          </TabsContent>
        ))}
      </Tabs>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent>
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{open?.employeeName}</SheetTitle>
            <SheetDescription>{open ? describe(open) : ""}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {open && <p className="text-sm">{open.reason}</p>}
            {open?.kind === "expense" && (
              <>
                <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {EXPENSE_CATEGORIES.find((c) => c.value === open.category)?.label}. Paid to {open.vendor}, bill {open.billNumber} dated {formatDate(open.date)}. Check the bill before approving.
                </p>
                <div className="space-y-1.5"><Label>Amount to repay (₹)</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} /><span>Pay now through Razorpay, into the employee&apos;s bank account, instead of with salary</span></label>
                {payNow && <PaymentCodeField value={code} onChange={setCode} />}
                {!payNow && <div className="space-y-1.5"><Label>Paid with the salary of</Label><Input type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} /></div>}
              </>
            )}
            {open?.kind === "overtime" && <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Approved overtime is paid in the {open.month} payroll run. Check it against the attendance record.</p>}
            <div className="space-y-1.5"><Label>Note to the employee (required to reject)</Label><Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></div>
            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button className="flex-1" disabled={pending} onClick={() => decide("approved")}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Approve"}</Button>
              <Button variant="outline" disabled={pending} onClick={() => decide("rejected")}>Reject</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
