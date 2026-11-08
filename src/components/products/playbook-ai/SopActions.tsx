"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Printer, Trash2 } from "lucide-react";
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
import { archiveSopAction, deleteDraftSopAction, recordDownloadAction, restoreSopAction } from "@/app/(products)/playbook-ai/(protected)/actions";

function Confirm({ trigger, title, description, action, confirmLabel }: { trigger: ReactNode; title: string; description: string; action: () => void; confirmLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={trigger as React.ReactElement} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false); // AlertDialogAction is a plain button; close explicitly
              action();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Archive / restore / discard-draft / print buttons. Which ones render is decided on the server from the same access predicates the actions re-check. */
export default function SopActions({
  sopId,
  canArchive,
  canRestore,
  canDiscard,
  canPrint,
}: {
  sopId: string;
  canArchive: boolean;
  canRestore: boolean;
  canDiscard: boolean;
  canPrint: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(success);
      after ? after() : router.refresh();
    });
  }

  function print() {
    void recordDownloadAction(sopId, "Printed / saved as PDF");
    window.print();
  }

  return (
    <>
      {canPrint && (
        <Button type="button" variant="outline" size="sm" onClick={print} className="sop-print-hide">
          <Printer className="size-3.5" data-icon="inline-start" />
          Print / PDF
        </Button>
      )}
      {canArchive && (
        <Confirm
          trigger={<Button type="button" variant="outline" size="sm" disabled={pending}><Archive className="size-3.5" data-icon="inline-start" />Archive</Button>}
          title="Archive this SOP?"
          description="It disappears from the library for readers and stops counting toward compliance. History and versions are kept, and you can restore it any time."
          confirmLabel="Archive"
          action={() => run(() => archiveSopAction(sopId), "SOP archived")}
        />
      )}
      {canRestore && (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => run(() => restoreSopAction(sopId), "SOP restored")}>
          <ArchiveRestore className="size-3.5" data-icon="inline-start" />
          Restore
        </Button>
      )}
      {canDiscard && (
        <Confirm
          trigger={<Button type="button" variant="destructive" size="sm" disabled={pending}><Trash2 className="size-3.5" data-icon="inline-start" />Discard draft</Button>}
          title="Discard this draft?"
          description="This SOP has never been published. Discarding removes it from the library (the action is kept in the audit log)."
          confirmLabel="Discard"
          action={() => run(() => deleteDraftSopAction(sopId), "Draft discarded", () => router.push("/playbook-ai/library"))}
        />
      )}
    </>
  );
}
