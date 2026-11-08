"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, RefreshCw, RotateCcw, Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  initiatePayoutAction,
  refreshPayoutAction,
  retryPayoutAction,
  cancelPayoutAction,
} from "@/app/(products)/talentos/(protected)/(staff)/payroll/actions";

interface Row {
  _id: string;
  status: string;
  employeeName: string;
  provider: "manual" | "razorpay";
}

export default function PayoutRowActions({ payout, code }: { payout: Row; /** The confirmation code the person typed above the table. */ code?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const refresh = () => router.refresh();

  function initiate() {
    startTransition(async () => {
      const r = await initiatePayoutAction(payout._id, code);
      if (!r.ok) {
        toast.error(r.error ?? "Could not initiate.");
        return;
      }
      toast.success("Payout initiated");
      refresh();
    });
  }
  function retry() {
    startTransition(async () => {
      const r = await retryPayoutAction(payout._id, code);
      if (!r.ok) {
        toast.error(r.error ?? "Could not retry.");
        return;
      }
      toast.success("Retry started");
      refresh();
    });
  }
  function cancel() {
    startTransition(async () => {
      const r = await cancelPayoutAction(payout._id);
      if (!r.ok) {
        toast.error(r.error ?? "Could not cancel.");
        return;
      }
      toast.success("Payout cancelled");
      refresh();
    });
  }
  function refreshStatus() {
    startTransition(async () => {
      const r = await refreshPayoutAction(payout._id);
      if (!r.ok) {
        toast.error(r.error ?? "Could not check with RazorpayX.");
        return;
      }
      toast.success("Checked with RazorpayX");
      refresh();
    });
  }

  const canInitiate = payout.status === "pending";
  const canRefresh = payout.status === "initiated" || payout.status === "processing";
  const canRetry = payout.status === "failed";
  const canCancel = payout.status === "pending" || payout.status === "failed";

  return (
    <div className="flex items-center gap-1">
      {canInitiate && (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={initiate}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" data-icon="inline-start" />}
          Initiate
        </Button>
      )}
      {canRefresh && (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={refreshStatus}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" data-icon="inline-start" />}
          Check status
        </Button>
      )}
      {canRetry && (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={retry}>
          <RotateCcw className="size-3.5" data-icon="inline-start" />
          Retry
        </Button>
      )}
      {canCancel && (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button type="button" variant="ghost" size="icon-sm" disabled={pending} aria-label="Cancel payout">
                <Ban className="size-3.5" />
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel {payout.employeeName}&apos;s payout?</AlertDialogTitle>
              <AlertDialogDescription>It is excluded from the run total and no payment is made.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep</AlertDialogCancel>
              <AlertDialogAction onClick={cancel}>Cancel Payout</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

    </div>
  );
}
