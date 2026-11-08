"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { updateProgressAction } from "@/app/(products)/sprintos/(protected)/projects/actions";

export default function ProjectProgressControl({
  projectId,
  progressPercent,
  editable,
  taskDriven = false,
}: {
  projectId: string;
  progressPercent: number;
  editable: boolean;
  taskDriven?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(progressPercent);

  if (taskDriven) {
    return (
      <div className="space-y-1.5">
        <ProgressBar value={progressPercent} />
        <p className="text-xs text-muted-foreground">Calculated automatically from task completion.</p>
      </div>
    );
  }

  if (!editable) return <ProgressBar value={progressPercent} />;

  const dirty = value !== progressPercent;

  function save() {
    startTransition(async () => {
      const result = await updateProgressAction(projectId, value);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update progress.");
        return;
      }
      toast.success("Progress updated");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <ProgressBar value={value} />
      <div className="flex items-center gap-2">
        <Input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="flex-1"
        />
        <Button type="button" size="sm" variant="outline" onClick={save} disabled={!dirty || pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}
