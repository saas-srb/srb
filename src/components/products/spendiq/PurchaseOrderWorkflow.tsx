"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Ban, CheckCircle2, Trash2, FileDown, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  issuePurchaseOrderAction,
  cancelPurchaseOrderAction,
  closePurchaseOrderAction,
  deletePurchaseOrderAction,
} from "@/app/(products)/spendiq/(protected)/(staff)/purchase-orders/actions";

export default function PurchaseOrderWorkflow({
  id,
  poNumber,
  status,
  canManage,
}: {
  id: string;
  poNumber: string;
  status: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, redirectTo?: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(okMsg);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a href={`/api/spendiq/purchase-orders/${poNumber}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
        <FileDown className="size-3.5" data-icon="inline-start" />
        PDF
      </a>

      {canManage && status === "draft" && (
        <Button type="button" size="sm" disabled={pending} onClick={() => run(() => issuePurchaseOrderAction(id), "Purchase order issued")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5" data-icon="inline-start" />}
          Issue PO
        </Button>
      )}

      {canManage && ["issued", "partially_received", "received"].includes(status) && (
        <a href={`/spendiq/grn?po=${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Record Goods Receipt
        </a>
      )}

      {canManage && ["issued", "partially_received", "received"].includes(status) && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => closePurchaseOrderAction(id), "Purchase order closed")}>
          <CheckCircle2 className="size-3.5" data-icon="inline-start" />
          Close PO
        </Button>
      )}

      {canManage && !["received", "closed", "cancelled"].includes(status) && (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => cancelPurchaseOrderAction(id), "Purchase order cancelled")}>
          <Ban className="size-3.5 text-destructive" data-icon="inline-start" />
          Cancel
        </Button>
      )}

      {canManage && ["draft", "cancelled"].includes(status) && (
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
              <AlertDialogTitle>Delete {poNumber}?</AlertDialogTitle>
              <AlertDialogDescription>This purchase order will be removed.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={pending} onClick={() => run(() => deletePurchaseOrderAction(id), "Purchase order deleted", "/spendiq/purchase-orders")}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
