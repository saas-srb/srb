"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { revokeCertificateAction } from "@/app/(products)/evaliq/(protected)/actions";

export default function CertificateAdminActions({ id, number, revoked }: { id: string; number: string; revoked: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const run = (revoke: boolean) =>
    start(async () => {
      const res = await revokeCertificateAction(id, revoke, reason);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(revoke ? "Certificate revoked" : "Certificate restored");
        setOpen(false);
        router.refresh();
      }
    });
  if (revoked)
    return (
      <Button size="xs" variant="outline" disabled={pending} onClick={() => run(false)}>
        {pending ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Restore
      </Button>
    );
  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
        <Ban className="size-3" /> Revoke
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`Revoke ${number}?`}</DialogTitle>
            <DialogDescription>The public verification page will show it as revoked and the holder can no longer download it.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason (required, shown on verification)" aria-label="Reason" />
          <DialogFooter>
            <Button variant="destructive" disabled={pending || !reason.trim()} onClick={() => run(true)}>
              {pending && <Loader2 className="size-3.5 animate-spin" />} Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
