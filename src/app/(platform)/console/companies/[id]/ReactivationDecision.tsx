"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REASON_MAX, REASON_MIN, reasonError } from "@/lib/platform/reactivation-rule";
import { decideReactivationAction } from "./reactivation-actions";

/** Approve / Reject for one pending request. Approving asks to confirm (it switches the company on); rejecting needs a reason. */
export default function ReactivationDecision({ requestId, companyName }: { requestId: string; companyName: string }) {
  const router = useRouter();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (decision: "approved" | "rejected", text: string, onDone: () => void) => {
    setError(null);
    start(async () => {
      const res = await decideReactivationAction(requestId, decision, text).catch(() => ({ ok: false as const, error: "Something went wrong. Please try again." }));
      if (!res.ok) return setError(res.error);
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" onClick={() => { setError(null); setApproveOpen(true); }}>
        <Check className="size-4" data-icon="inline-start" /> Approve
      </Button>
      <Button type="button" variant="outline" className="text-destructive" onClick={() => { setError(null); setRejectOpen(true); }}>
        <X className="size-4" data-icon="inline-start" /> Reject
      </Button>

      <AlertDialog open={approveOpen} onOpenChange={(o) => !pending && setApproveOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve and reactivate {companyName}?</AlertDialogTitle>
            <AlertDialogDescription>The workspace comes back online at every address right away, and the requester is emailed. Check the ID against the request first.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="approve-note">Note to the requester (optional)</Label>
            <Textarea id="approve-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={REASON_MAX} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); run("approved", note, () => setApproveOpen(false)); }} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Approve & reactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={rejectOpen} onOpenChange={(o) => !pending && setRejectOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject this request</DialogTitle>
            <DialogDescription>The company stays suspended. The reason below is emailed to the requester and shown on the suspended page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={REASON_MAX} placeholder="e.g. The ID doesn't match the company's Director. Send a clear photo of the Director's ID." />
            <p className="text-right text-xs text-muted-foreground">{reason.trim().length}/{REASON_MAX} · at least {REASON_MIN}</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => { const bad = reasonError(reason); if (bad) return setError(bad); run("rejected", reason, () => { setRejectOpen(false); setReason(""); }); }}>
              {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null} Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
