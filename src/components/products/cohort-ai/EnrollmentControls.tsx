"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { STUDENT_STATUSES } from "@/lib/products/cohort-ai/constants";
import { updateEnrollmentAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/students/actions";

export default function EnrollmentControls({
  studentId,
  batchId,
  status,
  progressPercent,
}: {
  studentId: string;
  batchId: string;
  status: string;
  progressPercent: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [progress, setProgress] = useState(String(progressPercent));

  function save(patch: { status?: string; progressPercent?: number }) {
    startTransition(async () => {
      const result = await updateEnrollmentAction(studentId, batchId, patch);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update enrolment.");
        return;
      }
      toast.success("Enrolment updated");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={status} onValueChange={(v) => save({ status: v ?? status })} disabled={pending}>
        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          {STUDENT_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={0}
          max={100}
          value={progress}
          onChange={(e) => setProgress(e.target.value)}
          className="h-8 w-20"
        />
        <span className="text-xs text-muted-foreground">%</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || Number(progress) === progressPercent}
          onClick={() => save({ progressPercent: Number(progress) })}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
    </div>
  );
}
