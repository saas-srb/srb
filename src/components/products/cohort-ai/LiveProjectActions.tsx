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
import LiveProjectForm, { type StudentMembership } from "@/components/products/cohort-ai/LiveProjectForm";
import { deleteLiveProjectAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/projects/actions";
import type { SerializedLiveProject } from "@/lib/products/cohort-ai/projects";

export default function LiveProjectActions({
  project,
  programs,
  batches,
  mentors,
  memberships,
}: {
  project: SerializedLiveProject;
  programs: { _id: string; name: string }[];
  batches: { _id: string; name: string; programId: string }[];
  mentors: { _id: string; name: string }[];
  memberships: StudentMembership[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteLiveProjectAction(project._id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete project.");
        return;
      }
      toast.success("Project deleted");
      router.push("/cohort-ai/projects");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <LiveProjectForm
        project={project}
        programs={programs}
        batches={batches}
        mentors={mentors}
        memberships={memberships}
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
            <AlertDialogTitle>Delete {project.title}?</AlertDialogTitle>
            <AlertDialogDescription>Soft-deleted and kept for audit history.</AlertDialogDescription>
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
