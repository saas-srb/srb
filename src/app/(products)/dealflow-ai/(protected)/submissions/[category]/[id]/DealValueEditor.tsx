"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { updateDealValueAction } from "./actions";

export default function DealValueEditor({
  category,
  id,
  initialValue,
}: {
  category: string;
  id: string;
  initialValue: number | null;
}) {
  const [value, setValue] = useState(initialValue == null ? "" : String(initialValue));
  const [saved, setSaved] = useState(initialValue == null ? "" : String(initialValue));
  const [isPending, startTransition] = useTransition();

  function commit() {
    const next = value.trim();
    if (next === saved) return;
    startTransition(async () => {
      const result = await updateDealValueAction(category, id, next);
      if (result.error) {
        setValue(saved);
        toast.error(result.error);
      } else {
        setSaved(next);
        toast.success(next === "" ? "Deal value cleared" : "Deal value saved");
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">Deal Value (₹)</label>
      <Input
        inputMode="decimal"
        value={value}
        disabled={isPending}
        placeholder="e.g. 50000"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <p className="text-xs text-muted-foreground">Won-deal value for this lead — drives campaign ROI.</p>
    </div>
  );
}
