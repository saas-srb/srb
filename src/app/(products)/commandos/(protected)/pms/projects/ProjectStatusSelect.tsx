"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PROJECT_STATUSES, getProjectStatusMeta } from "@/lib/products/sprintos/constants";
import { changeProjectStatusAction } from "./actions";

export default function ProjectStatusSelect({ id, initialStatus }: { id: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string | null) {
    if (!value) return;
    const previous = status;
    setStatus(value);
    startTransition(async () => {
      const result = await changeProjectStatusAction(id, value);
      if (!result.ok) {
        setStatus(previous);
        // Illegal transitions come back with a specific, real reason (guarded
        // in `changeProjectStatus`) — surface it rather than a generic error.
        toast.error(result.error ?? "Could not update status.");
      } else {
        toast.success(`Status updated to ${getProjectStatusMeta(value).label}`);
      }
    });
  }

  return (
    <Select value={status} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger size="sm" className="w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PROJECT_STATUSES.map((s) => (
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
