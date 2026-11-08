"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Banknote, Trash2, Upload, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
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
import type { SerializedExpense } from "@/lib/products/spendiq/expenses";
import {
  decideExpenseAction,
  reimburseExpenseAction,
  toggleRecurringExpenseAction,
  deleteExpenseAction,
  uploadExpenseInvoiceAction,
} from "@/app/(products)/spendiq/(protected)/(staff)/expenses/actions";

export default function ExpenseWorkflow({
  expense,
  isOwner,
  canApprove,
  backPath,
}: {
  expense: SerializedExpense;
  isOwner: boolean;
  canApprove: boolean;
  backPath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const e = expense;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, to?: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(ok);
      setNote("");
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
      const res = await uploadExpenseInvoiceAction(e._id, fd);
      if (!res.ok) {
        toast.error(res.error ?? "Upload failed.");
        return;
      }
      toast.success("Invoice attached");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  const canEdit = e.approvalStatus === "pending" && (isOwner || canApprove);

  return (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {canApprove && e.approvalStatus === "pending" && (
          <div className="space-y-2">
            <Textarea value={note} onChange={(ev) => setNote(ev.target.value)} rows={2} placeholder="Note (required to reject)" />
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={pending} onClick={() => run(() => decideExpenseAction(e._id, true, note), "Approved")}>
                <Check className="size-3.5" data-icon="inline-start" />
                Approve
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending || !note.trim()} onClick={() => run(() => decideExpenseAction(e._id, false, note), "Rejected")}>
                <X className="size-3.5 text-destructive" data-icon="inline-start" />
                Reject
              </Button>
            </div>
          </div>
        )}

        {canApprove && e.approvalStatus === "approved" && (
          <Button type="button" size="sm" disabled={pending} onClick={() => run(() => reimburseExpenseAction(e._id), "Marked reimbursed")}>
            <Banknote className="size-3.5" data-icon="inline-start" />
            Mark reimbursed
          </Button>
        )}

        {canApprove && e.recurrence && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => toggleRecurringExpenseAction(e._id, !e.recurrence!.active), e.recurrence!.active ? "Recurrence paused" : "Recurrence resumed")}>
            {e.recurrence.active ? <Pause className="size-3.5" data-icon="inline-start" /> : <Play className="size-3.5" data-icon="inline-start" />}
            {e.recurrence.active ? "Pause recurrence" : "Resume recurrence"}
          </Button>
        )}

        {canEdit && (
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" className="text-xs" onChange={onUpload} />
            <Upload className="size-3.5 text-muted-foreground" />
          </div>
        )}
        {e.invoiceStorageKey && (
          <a href={`/api/spendiq/attachments/${e.invoiceStorageKey}`} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">
            {e.invoiceFilename ?? "View invoice"}
          </a>
        )}

        {(isOwner || canApprove) && e.approvalStatus !== "reimbursed" && (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button type="button" size="sm" variant="outline">
                  <Trash2 className="size-3.5 text-destructive" data-icon="inline-start" />
                  Delete
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {e.expenseCode}?</AlertDialogTitle>
                <AlertDialogDescription>This expense will be removed.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={pending} onClick={() => run(() => deleteExpenseAction(e._id), "Expense deleted", backPath)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {e.rejectionReason && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">Rejected: {e.rejectionReason}</p>
        )}

        <p className="text-xs text-muted-foreground">
          <a href={backPath} className="text-primary hover:underline">← Back</a>
        </p>
      </CardContent>
    </GlassCard>
  );
}
