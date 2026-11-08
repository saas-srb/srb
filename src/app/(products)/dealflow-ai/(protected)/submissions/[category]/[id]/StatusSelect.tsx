"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { LEAD_STATUSES, getStatusMeta } from "@/lib/lead-status";
import { updateStatusAction } from "./actions";

export default function StatusSelect({ category, id, initialStatus }: { category: string; id: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string | null) {
    if (!value) return;
    const next = value;
    const previous = status;
    setStatus(next);
    startTransition(async () => {
      const result = await updateStatusAction(category, id, next);
      if (result.error) {
        setStatus(previous);
        toast.error(result.error);
      } else {
        toast.success(`Status updated to ${getStatusMeta(next).label}`);
      }
    });
  }

  return (
    <Select value={status} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEAD_STATUSES.map((s) => (
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
