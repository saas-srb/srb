"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Undo2, Loader2 } from "lucide-react";
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
import { undoImportAction } from "@/app/(products)/dealflow-ai/(protected)/campaigns/actions";

export default function UndoImportButton({ importId, label }: { importId: string; label: string }) {
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await undoImportAction(importId);
      if (res.error) toast.error(res.error);
      else toast.success("Import undone.");
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button type="button" variant="ghost" size="sm" disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" data-icon="inline-start" />}
            Undo
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo this import?</AlertDialogTitle>
          <AlertDialogDescription>
            {label} This restores the affected campaign metrics and lead attribution to their previous state.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={run}>Undo import</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
