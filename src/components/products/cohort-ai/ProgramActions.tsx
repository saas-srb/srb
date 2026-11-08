"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, Loader2 } from "lucide-react";
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
import ProgramForm from "@/components/products/cohort-ai/ProgramForm";
import { deleteProgramAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/programs/actions";
import type { SerializedProgram } from "@/lib/products/cohort-ai/programs";

export default function ProgramActions({
  program,
  technologySuggestions,
}: {
  program: SerializedProgram;
  technologySuggestions: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteProgramAction(program._id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete program.");
        return;
      }
      toast.success("Program deleted");
      router.push("/cohort-ai/programs");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <ProgramForm
        program={program}
        technologySuggestions={technologySuggestions}
        trigger={
          <Button type="button" variant="outline" size="sm">
            <Pencil className="size-3.5" data-icon="inline-start" />
            Edit
          </Button>
        }
      />
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button type="button" variant="outline" size="sm" disabled={pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Trash2 className="size-3.5" data-icon="inline-start" />}
              Delete
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {program.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This is blocked while any batch still belongs to this program. Otherwise it is soft-deleted and kept for audit history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
