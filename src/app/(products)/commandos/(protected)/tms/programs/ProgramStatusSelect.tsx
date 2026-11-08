"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PROGRAM_STATUSES, getProgramStatusMeta } from "@/lib/products/cohort-ai/constants";
import { updateProgramStatusAction } from "./actions";

export default function ProgramStatusSelect({ id, initialStatus }: { id: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string | null) {
    if (!value) return;
    const previous = status;
    setStatus(value);
    startTransition(async () => {
      const result = await updateProgramStatusAction(id, value);
      if (!result.ok) {
        setStatus(previous);
        toast.error(result.error ?? "Could not update status.");
      } else {
        toast.success(`Status updated to ${getProgramStatusMeta(value).label}`);
      }
    });
  }

  return (
    <Select value={status} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger size="sm" className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROGRAM_STATUSES.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            <span className="flex items-center gap-2">
              <span className={`size-1.5 rounded-full ${s.dotClass}`} />
              {s.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
