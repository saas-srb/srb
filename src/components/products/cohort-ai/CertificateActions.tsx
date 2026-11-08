"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw, Ban, Undo2, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  reissueCertificateAction,
  setCertificateRevokedAction,
} from "@/app/(products)/cohort-ai/(protected)/(staff)/certificates/actions";

export default function CertificateActions({
  certificateId,
  revoked,
}: {
  certificateId: string;
  revoked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  function reissue() {
    startTransition(async () => {
      const result = await reissueCertificateAction(certificateId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not reissue.");
        return;
      }
      toast.success("Reissued with a new number");
      if (result.id) router.push(`/cohort-ai/certificates/${result.id}`);
    });
  }

  function setRevoked(next: boolean) {
    startTransition(async () => {
      const result = await setCertificateRevokedAction(certificateId, next, reason);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update.");
        return;
      }
      toast.success(next ? "Certificate revoked" : "Certificate reinstated");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`/api/cohort-ai/certificates/${certificateId}/pdf`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Download PDF
      </a>

      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={reissue}>
        {pending ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <RotateCcw className="size-3.5" data-icon="inline-start" />}
        Reissue
      </Button>

      {revoked ? (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setRevoked(false)}>
          <Undo2 className="size-3.5" data-icon="inline-start" />
          Reinstate
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button type="button" variant="outline" size="sm" disabled={pending}>
                <Ban className="size-3.5" data-icon="inline-start" />
                Revoke
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke this certificate?</AlertDialogTitle>
              <AlertDialogDescription>
                Public verification will show it as revoked. The student can no longer download it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown on the verify page)" />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => setRevoked(true)}>Revoke</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
