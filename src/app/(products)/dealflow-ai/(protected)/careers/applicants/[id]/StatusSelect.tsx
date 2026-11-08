"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CAREER_APPLICATION_STATUSES, getCareerApplicationStatusMeta } from "@/lib/career-application-status";
import { updateApplicationStatusAction } from "../../actions";

export default function StatusSelect({ id, initialStatus }: { id: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string | null) {
    if (!value) return;
    const next = value;
    const previous = status;
    setStatus(next);
    startTransition(async () => {
      const result = await updateApplicationStatusAction(id, next);
      if (result.error) {
        setStatus(previous);
        toast.error(result.error);
      } else {
        toast.success(`Status updated to ${getCareerApplicationStatusMeta(next).label}`);
      }
    });
  }

  return (
    <Select value={status} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CAREER_APPLICATION_STATUSES.map((s) => (
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
