"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markReadyAction, recloneAction, sendToSignersAction, voidCloneAction, type ActionResult } from "@/app/(products)/contractflow-ai/(protected)/clones/[id]/actions";

/** Mark ready, void (with a reason) and replace-a-voided-document buttons. Each is re-checked on the server. */
export default function CloneActions({ id, canMarkReady, canSend, canVoid, canReclone, locked }: { id: string; canMarkReady: boolean; canSend: boolean; canVoid: boolean; canReclone: boolean; locked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  function run(fn: () => Promise<ActionResult>) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.message);
      else {
        if (r.message) toast.success(r.message);
        setVoiding(false);
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {canMarkReady && <Button size="sm" disabled={pending} onClick={() => run(() => markReadyAction(id))}>Mark ready to send</Button>}
      {canSend && <Button size="sm" disabled={pending} onClick={() => run(() => sendToSignersAction(id))}>Send to signers</Button>}
      {canVoid && !voiding && <Button size="sm" variant="outline" disabled={pending} onClick={() => setVoiding(true)}>{locked ? "Void and replace…" : "Void…"}</Button>}
      {canVoid && voiding && (
        <div className="flex flex-wrap items-center gap-2">
          <input className="h-8 w-64 rounded-md border border-input bg-transparent px-2 text-sm" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for voiding" />
          <Button size="sm" variant="destructive" disabled={pending || reason.trim().length < 3} onClick={() => run(() => voidCloneAction(id, reason))}>Void this document</Button>
          <Button size="sm" variant="ghost" onClick={() => setVoiding(false)}>Cancel</Button>
        </div>
      )}
      {canReclone && (
        <>
          <Button size="sm" disabled={pending} onClick={() => run(() => recloneAction(id, "edited"))}>New document from this edited copy</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => recloneAction(id, "source"))}>New document from the Playbook version</Button>
        </>
      )}
    </div>
  );
}
