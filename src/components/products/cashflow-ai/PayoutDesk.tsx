"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, RotateCcw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import PaymentCodeField from "@/components/products/cashflow-ai/PaymentCodeField";
import { approvePayoutAction, payAnyoneAction, refreshPayoutDeskAction, rejectPayoutAction, retryPayoutDeskAction, savePaymentControlsAction } from "@/app/(products)/cashflow-ai/(protected)/payouts/actions";

export interface DeskRow {
  _id: string;
  payeeName: string;
  detail: string;
  amount: number;
  purpose: string;
  status: "pending_approval" | "rejected" | "queued" | "processing" | "processed" | "failed" | "reversed";
  utr: string | null;
  failureReason: string | null;
  at: string;
  canRetry: boolean;
  /** Who started it: the person who started a payment cannot approve it. */
  startedBy: string;
}

export interface ControlsView {
  perPayoutMax: number;
  dailyMax: number;
  salaryDailyMax: number;
  approvalThreshold: number;
  requireCode: boolean;
  payeeHoldHours: number;
}

const statusClass: Record<string, string> = {
  processed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  processing: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  queued: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  failed: "bg-destructive/15 text-destructive",
  reversed: "bg-destructive/15 text-destructive",
  rejected: "bg-muted text-muted-foreground",
  pending_approval: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
};
const statusLabel: Record<string, string> = { pending_approval: "Waiting for approval", rejected: "Refused", processed: "Paid", processing: "Processing", queued: "Not sent yet", failed: "Failed", reversed: "Returned" };
const PURPOSES = [["vendor_bill", "Vendor bill"], ["refund", "Refund"], ["reimbursement", "Reimbursement"], ["advance", "Advance"], ["other", "Other"]];
const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export default function PayoutDesk({ rows, connected, userId, controls, isOwner }: { rows: DeskRow[]; connected: boolean; userId: string; controls: ControlsView; isOwner: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ payeeName: "", channel: "imps", payeeAccount: "", ifsc: "", amount: "", purpose: "other", note: "" });
  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [decide, setDecide] = useState<{ id: string; mode: "approve" | "reject" } | null>(null);
  const [reason, setReason] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  function pay() {
    setError(null);
    start(async () => {
      const r = await payAnyoneAction({ ...f, code, clientRequestId: requestId });
      if (!r.ok) return void setError(r.error ?? "Could not send.");
      toast.success(r.message ?? "Sent");
      setF((x) => ({ ...x, payeeName: "", payeeAccount: "", ifsc: "", amount: "", note: "" }));
      setCode("");
      setRequestId(crypto.randomUUID());
      router.refresh();
    });
  }
  function act(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? "Could not do that.");
      toast.success(r.message ?? "Done");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-semibold">Pay someone</p>
        <p className="mb-3 text-xs text-muted-foreground">Paid by RazorpayX from your RazorpayX balance. A payment of {formatMoney(controls.approvalThreshold, "INR")} or more waits for a second person to approve it. {connected ? "" : "Razorpay is not connected yet (Settings → Payments)."}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5"><Label>Pay to</Label><Input value={f.payeeName} maxLength={120} onChange={(e) => set("payeeName", e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>How</Label>
            <select className={selectCls} value={f.channel} onChange={(e) => set("channel", e.target.value)}>
              <option value="imps">IMPS (instant, up to ₹5L)</option>
              <option value="neft">NEFT</option>
              <option value="rtgs">RTGS (₹2L or more)</option>
              <option value="upi">UPI</option>
            </select>
          </div>
          <div className="space-y-1.5"><Label>{f.channel === "upi" ? "UPI id" : "Account number"}</Label><Input value={f.payeeAccount} onChange={(e) => set("payeeAccount", e.target.value)} placeholder={f.channel === "upi" ? "name@bank" : ""} /></div>
          {f.channel !== "upi" && <div className="space-y-1.5"><Label>IFSC</Label><Input value={f.ifsc} maxLength={11} onChange={(e) => set("ifsc", e.target.value.toUpperCase())} /></div>}
          <div className="space-y-1.5"><Label>Amount (₹)</Label><Input inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>For</Label>
            <select className={selectCls} value={f.purpose} onChange={(e) => set("purpose", e.target.value)}>{PURPOSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <div className="space-y-1.5 lg:col-span-2"><Label>Note (shown to the payee, 30 characters)</Label><Input value={f.note} maxLength={120} onChange={(e) => set("note", e.target.value)} /></div>
        </div>
        <div className="mt-3 max-w-md"><PaymentCodeField value={code} onChange={setCode} /></div>
        {error && <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        <Button className="mt-3" disabled={pending || !connected} onClick={pay}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5" data-icon="inline-start" />}Pay with Razorpay</Button>
      </div>

      <div className="rounded-lg border bg-card">
        <p className="border-b p-4 text-sm font-semibold">Payments made through Razorpay</p>
        {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nothing paid yet.</p> : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r._id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{r.payeeName} · {formatMoney(r.amount, "INR")}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.detail} · {r.purpose} · {r.at}{r.utr ? ` · UTR ${r.utr}` : ""}{r.failureReason && r.status !== "processed" ? ` · ${r.failureReason}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={statusClass[r.status]}>{statusLabel[r.status]}</Badge>
                  {r.status === "pending_approval" && r.startedBy !== userId && <><Button size="sm" onClick={() => { setDecide({ id: r._id, mode: "approve" }); setCode(""); setReason(""); }}>Approve</Button><Button size="sm" variant="outline" onClick={() => { setDecide({ id: r._id, mode: "reject" }); setReason(""); }}>Refuse</Button></>}
                  {r.status === "pending_approval" && r.startedBy === userId && <span className="text-xs text-muted-foreground">Another person must approve</span>}
                  {(r.status === "processing") && <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => refreshPayoutDeskAction(r._id))}><RefreshCw className="size-3.5" data-icon="inline-start" />Check status</Button>}
                  {r.canRetry && <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => retryPayoutDeskAction(r._id, code))}><RotateCcw className="size-3.5" data-icon="inline-start" />Send again</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {decide && (
        <div className="rounded-lg border border-primary/40 bg-card p-4">
          <p className="text-sm font-semibold">{decide.mode === "approve" ? "Approve this payment" : "Refuse this payment"}</p>
          <div className="mt-3 max-w-md space-y-3">
            {decide.mode === "approve" ? <PaymentCodeField value={code} onChange={setCode} /> : <div className="space-y-1.5"><Label>Why</Label><Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></div>}
            <div className="flex gap-2">
              <Button disabled={pending} onClick={() => act(async () => { const r = decide.mode === "approve" ? await approvePayoutAction(decide.id, code) : await rejectPayoutAction(decide.id, reason); if (r.ok) { setDecide(null); setCode(""); } return r; })}>{pending ? <Loader2 className="size-4 animate-spin" /> : decide.mode === "approve" ? "Approve and send" : "Refuse"}</Button>
              <Button variant="outline" onClick={() => setDecide(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      <LimitsCard controls={controls} isOwner={isOwner} />
    </div>
  );
}

function LimitsCard({ controls, isOwner }: { controls: ControlsView; isOwner: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ perPayoutMax: String(controls.perPayoutMax), dailyMax: String(controls.dailyMax), salaryDailyMax: String(controls.salaryDailyMax), approvalThreshold: String(controls.approvalThreshold), payeeHoldHours: String(controls.payeeHoldHours), requireCode: controls.requireCode });
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields: [keyof typeof f, string][] = [["perPayoutMax", "Most for one payment (₹)"], ["dailyMax", "Most in a day, all payments (₹)"], ["salaryDailyMax", "Most in salaries in a day (₹)"], ["approvalThreshold", "A second person approves from (₹)"], ["payeeHoldHours", "New or changed bank details wait (hours)"]];
  function save() {
    start(async () => {
      const r = await savePaymentControlsAction({ ...f, code });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return void toast.error(r.error ?? "Could not save.");
      }
      setErrors({});
      setCode("");
      toast.success("Saved");
      router.refresh();
    });
  }
  return (
    <details className="rounded-lg border bg-card">
      <summary className="cursor-pointer p-4 text-sm font-semibold">Limits and approvals {isOwner ? "" : "(only the company owner can change these)"}</summary>
      <div className="space-y-3 border-t p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label>{label}</Label>
              <Input disabled={!isOwner} inputMode="numeric" value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
            </div>
          ))}
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={!isOwner} className="mt-0.5 size-4 accent-primary" checked={f.requireCode} onChange={(e) => setF({ ...f, requireCode: e.target.checked })} /><span>Ask for a confirmation code before money leaves (recommended). Turning this off lets anyone who is signed in send money without it.</span></label>
        {isOwner && <><div className="max-w-md"><PaymentCodeField value={code} onChange={setCode} /></div><Button disabled={pending} onClick={save}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Save limits"}</Button></>}
      </div>
    </details>
  );
}
