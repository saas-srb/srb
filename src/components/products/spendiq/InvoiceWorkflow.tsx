"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Ban, Trash2, Loader2, Upload, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { PAYMENT_METHODS, formatMoney, round2 } from "@/lib/products/spendiq/constants";
import type { SerializedInvoice } from "@/lib/products/spendiq/invoices";
import {
  decideInvoiceAction,
  deleteInvoiceAction,
  uploadInvoiceFileAction,
  recordPaymentAction,
} from "@/app/(products)/spendiq/(protected)/(staff)/invoices/actions";

export default function InvoiceWorkflow({ invoice }: { invoice: SerializedInvoice }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const i = invoice;
  const outstanding = round2(i.netPayable - i.amountPaid);

  const [amount, setAmount] = useState(String(outstanding > 0 ? outstanding : ""));
  const [method, setMethod] = useState("bank_transfer");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");
  const [schedule, setSchedule] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, to?: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(ok);
      if (to) router.push(to);
      else router.refresh();
    });
  }

  function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadInvoiceFileAction(i._id, fd);
      if (!res.ok) {
        toast.error(res.error ?? "Upload failed.");
        return;
      }
      toast.success("Invoice file attached");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  function pay() {
    run(
      () => recordPaymentAction({ invoiceId: i._id, amount, method, paymentDate, transactionReference: ref, status: schedule ? "scheduled" : "processed", currency: i.currency }),
      schedule ? "Payment scheduled" : "Payment recorded"
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded-md px-2 py-1 ${i.poMatched ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
              {i.poMatched ? "PO matched" : "No PO match"}
            </span>
            <span className={`rounded-md px-2 py-1 ${i.grnMatched ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
              {i.grnMatched ? "GRN matched" : "No GRN"}
            </span>
          </div>

          {i.status === "pending" && (
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={pending} onClick={() => run(() => decideInvoiceAction(i._id, "approved"), "Invoice approved")}>
                <Check className="size-3.5" data-icon="inline-start" />
                Approve
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => decideInvoiceAction(i._id, "cancelled"), "Invoice cancelled")}>
                <Ban className="size-3.5 text-destructive" data-icon="inline-start" />
                Cancel
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" className="text-xs" onChange={onUpload} />
            <Upload className="size-3.5 text-muted-foreground" />
          </div>
          {i.storageKey && (
            <a href={`/api/spendiq/attachments/${i.storageKey}`} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">
              {i.filename ?? "View invoice file"}
            </a>
          )}

          {i.amountPaid === 0 && ["pending", "cancelled"].includes(i.status) && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button type="button" size="sm" variant="outline"><Trash2 className="size-3.5 text-destructive" data-icon="inline-start" />Delete</Button>} />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {i.invoiceNumber}?</AlertDialogTitle>
                  <AlertDialogDescription>This invoice will be removed.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction disabled={pending} onClick={() => run(() => deleteInvoiceAction(i._id), "Invoice deleted", "/spendiq/invoices")}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardContent>
      </GlassCard>

      {["approved", "partially_paid", "overdue"].includes(i.status) && outstanding > 0 && (
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Record Payment</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Outstanding: {formatMoney(outstanding, i.currency)}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment date</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={method} onValueChange={(v) => setMethod(v ?? "bank_transfer")}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Txn reference</Label>
                <Input value={ref} onChange={(e) => setRef(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
              Schedule (not yet paid)
            </label>
            <Button type="button" size="sm" disabled={pending || !amount} onClick={pay}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Banknote className="size-3.5" data-icon="inline-start" />}
              {schedule ? "Schedule payment" : "Record payment"}
            </Button>
          </CardContent>
        </GlassCard>
      )}

      <p className="text-xs text-muted-foreground">
        <Link href="/spendiq/invoices" className="text-primary hover:underline">← Back to invoices</Link>
      </p>
    </div>
  );
}
