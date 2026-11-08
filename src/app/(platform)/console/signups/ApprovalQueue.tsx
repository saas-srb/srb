"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { cn, formatDateTime } from "@/lib/utils";
import type { AwaitingApproval } from "@/lib/platform/signup";
import { approveSignupAction, rejectSignupAction } from "./actions";

export default function ApprovalQueue({ requests, addressOf, canManage = true }: { requests: AwaitingApproval[]; addressOf: Record<string, string>; canManage?: boolean }) {
  const router = useRouter();
  const [decision, setDecision] = useState<{ request: AwaitingApproval; approve: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Requests decided in this session — hidden at once, before the server refresh lands.
  const [decided, setDecided] = useState<Set<string>>(() => new Set());
  const visible = requests.filter((r) => !decided.has(r.id));

  function decide(request: AwaitingApproval, approve: boolean) {
    setError(null);
    setDecision({ request, approve });
  }

  function confirm() {
    if (!decision) return;
    setError(null);
    start(async () => {
      const res = decision.approve ? await approveSignupAction(decision.request.id) : await rejectSignupAction(decision.request.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage(res.message);
      setDecided((d) => new Set(d).add(decision.request.id));
      setDecision(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {message && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">{message}</p>}
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sign-ups are waiting for approval.</p>
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-signup-email={r.email}>
              <div className="min-w-0">
                <p className="font-medium text-foreground">{r.companyName}</p>
                <p className="text-xs text-muted-foreground">
                  {addressOf[r.slug]} · {r.name} &lt;{r.email}&gt; · requested {formatDateTime(r.createdAt)}
                </p>
              </div>
              {canManage && <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => decide(r, false)}>
                  <X className="size-3.5" data-icon="inline-start" /> Reject
                </Button>
                <Button type="button" size="sm" onClick={() => decide(r, true)}>
                  <Check className="size-3.5" data-icon="inline-start" /> Approve
                </Button>
              </div>}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={decision !== null} onOpenChange={(open) => !open && !pending && setDecision(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{decision?.approve ? `Approve ${decision.request.companyName}?` : `Reject ${decision?.request.companyName ?? ""}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {decision?.approve
                ? `The workspace is created at ${addressOf[decision.request.slug]} with ${decision.request.email} as its owner, who is emailed a sign-in link.`
                : `The request is deleted and ${decision?.request.email ?? "the person"} gets a polite email saying it wasn't approved. They can sign up again later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant={decision?.approve ? "default" : "destructive"} onClick={confirm} disabled={pending} className={cn(pending && "opacity-70")}>
              {pending ? "Working…" : decision?.approve ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
