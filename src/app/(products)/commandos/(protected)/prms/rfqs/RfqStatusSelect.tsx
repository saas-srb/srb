"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { getRfqStatusMeta } from "@/lib/products/spendiq/constants";
import { updateRfqStatusAction } from "./actions";

const ADMIN_SETTABLE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent to Vendors" },
  { value: "quoted", label: "Quotes Received" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export default function RfqStatusSelect({ id, initialStatus }: { id: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();

  if (status === "awarded") {
    const meta = getRfqStatusMeta(status);
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
        {meta.label}
      </span>
    );
  }

  function handleChange(value: string | null) {
    if (!value) return;
    const previous = status;
    setStatus(value);
    startTransition(async () => {
      const result = await updateRfqStatusAction(id, value);
      if (!result.ok) {
        setStatus(previous);
        toast.error(result.error ?? "Could not update status.");
      } else {
        toast.success(`Status updated to ${getRfqStatusMeta(value).label}`);
      }
    });
  }

  return (
    <Select value={status} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger size="sm" className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ADMIN_SETTABLE_STATUSES.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            <span className="flex items-center gap-2">
              <span className={`size-1.5 rounded-full ${getRfqStatusMeta(s.value).dotClass}`} />
              {s.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
