"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { toggleMilestoneAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/projects/actions";
import type { Milestone } from "@/lib/products/cohort-ai/projects";

export default function ProjectMilestones({
  projectId,
  milestones,
  canToggle,
}: {
  projectId: string;
  milestones: Milestone[];
  canToggle: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(id: string, done: boolean) {
    startTransition(async () => {
      const result = await toggleMilestoneAction(projectId, id, done);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update milestone.");
        return;
      }
      router.refresh();
    });
  }

  if (milestones.length === 0) {
    return <p className="text-sm text-muted-foreground">No milestones defined.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {milestones.map((m) => (
        <li key={m.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
          <Checkbox
            checked={m.done}
            disabled={!canToggle || pending}
            onCheckedChange={(v) => toggle(m.id, v === true)}
          />
          <span className={cn(m.done && "text-muted-foreground line-through")}>{m.title}</span>
          {m.dueDate && <span className="ml-auto text-xs text-muted-foreground">due {m.dueDate}</span>}
        </li>
      ))}
    </ul>
  );
}
