"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CirclePause, CirclePlay } from "lucide-react";
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
import type { CompanyStatus } from "@/lib/platform/tenancy/companies";
import { setCompanyStatusAction } from "./actions";

/** Suspend / reactivate, always behind a confirm step. */
export default function StatusControl({ companyId, companyName, status }: { companyId: string; companyName: string; status: CompanyStatus }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const suspending = status === "active";

  function confirm() {
    setError(null);
    start(async () => {
      const res = await setCompanyStatusAction(companyId, suspending ? "suspended" : "active");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          render={
            <Button type="button" variant={suspending ? "destructive" : "default"}>
              {suspending ? <CirclePause className="size-4" data-icon="inline-start" /> : <CirclePlay className="size-4" data-icon="inline-start" />}
              {suspending ? "Suspend company" : "Reactivate company"}
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{suspending ? `Suspend ${companyName}?` : `Reactivate ${companyName}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {suspending
                ? "Every address of this workspace will show “No workspace here” and nobody in it can sign in or use any product. Its data is kept exactly as it is, and you can reactivate it at any time."
                : "The workspace comes back online at all of its addresses, with everything as it was when it was suspended."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant={suspending ? "destructive" : "default"} onClick={confirm} disabled={pending}>
              {pending ? "Saving…" : suspending ? "Suspend" : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && !open && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
