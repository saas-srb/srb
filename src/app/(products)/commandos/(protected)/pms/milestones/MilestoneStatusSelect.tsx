"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { MILESTONE_STATUSES, getMilestoneStatusMeta } from "@/lib/products/sprintos/constants";
import { updateMilestoneStatusAction } from "./actions";

export default function MilestoneStatusSelect({ id, initialStatus }: { id: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string | null) {
    if (!value) return;
    const previous = status;
    setStatus(value);
    startTransition(async () => {
      const result = await updateMilestoneStatusAction(id, value);
      if (!result.ok) {
        setStatus(previous);
        toast.error(result.error ?? "Could not update status.");
      } else {
        toast.success(`Status updated to ${getMilestoneStatusMeta(value).label}`);
      }
    });
  }

  return (
    <Select value={status} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger size="sm" className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MILESTONE_STATUSES.map((s) => (
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
