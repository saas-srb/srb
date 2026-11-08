"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CircleCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { creditNoteAction, markInvoicePaidAction, voidInvoiceAction } from "./actions";

type Mode = "paid" | "void" | "credit";

/** Mark paid / void (unpaid invoices) and issue a credit note (paid invoices), each behind a confirm dialog. */
export default function InvoiceActions({ id, number, status, remainingLabel }: { id: string; number: string; status: string; remainingLabel: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();

  function openDialog(mode: Mode | null) {
    setOpen(mode);
    setError(null);
    setText("");
    setAmount("");
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = open === "paid" ? await markInvoicePaidAction(id, text) : open === "void" ? await voidInvoiceAction(id, text) : await creditNoteAction(id, amount, text);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(open === "paid" ? `${number} marked paid` : open === "void" ? `${number} voided` : `Credit note ${"number" in res ? res.number : ""} issued`);
      openDialog(null);
      router.refresh();
    });
  }

  const dialogs: { mode: Mode; show: boolean; label: string; icon: typeof Ban; variant: "default" | "destructive" | "outline"; title: string; description: string; confirm: string }[] = [
    { mode: "paid", show: status === "unpaid", label: "Mark paid", icon: CircleCheck, variant: "default", title: `Mark ${number} paid?`, description: "Record that this invoice has been paid in full. The company gets the invoice-cum-receipt by email.", confirm: "Mark paid" },
    { mode: "void", show: status === "unpaid", label: "Void", icon: Ban, variant: "destructive", title: `Void ${number}?`, description: "The invoice stays on record with its number, marked void, and nothing is payable on it. This can't be undone.", confirm: "Void invoice" },
    { mode: "credit", show: status === "paid" && remainingLabel !== null, label: "Issue credit note", icon: Undo2, variant: "outline", title: `Credit note against ${number}`, description: `Reverses part or all of this invoice, tax included. Up to ${remainingLabel ?? ""} can still be credited. Refund the money itself through the payment provider.`, confirm: "Issue credit note" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {dialogs
        .filter((d) => d.show)
        .map((d) => (
          <AlertDialog key={d.mode} open={open === d.mode} onOpenChange={(o) => openDialog(o ? d.mode : null)}>
            <AlertDialogTrigger
              render={
                <Button type="button" variant={d.variant} id={`invoice-action-${d.mode}`}>
                  <d.icon className="size-4" data-icon="inline-start" />
                  {d.label}
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{d.title}</AlertDialogTitle>
                <AlertDialogDescription>{d.description}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3">
                {d.mode === "credit" && (
                  <div className="space-y-1.5">
                    <label htmlFor="credit-amount" className="text-sm font-medium">
                      Amount (₹, incl. GST)
                    </label>
                    <Input id="credit-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Leave blank for the full ${remainingLabel ?? ""}`} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <label htmlFor={`invoice-${d.mode}-text`} className="text-sm font-medium">
                    {d.mode === "paid" ? "Payment reference (optional)" : "Reason"}
                  </label>
                  {d.mode === "paid" ? (
                    <Input id={`invoice-${d.mode}-text`} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. NEFT UTR number" maxLength={120} />
                  ) : (
                    <Textarea id={`invoice-${d.mode}-text`} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} placeholder={d.mode === "void" ? "e.g. Issued in error" : "e.g. Refund on cancellation"} />
                  )}
                </div>
              </div>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                <AlertDialogAction variant={d.mode === "void" ? "destructive" : "default"} onClick={submit} disabled={pending}>
                  {pending ? "Saving…" : d.confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ))}
    </div>
  );
}
