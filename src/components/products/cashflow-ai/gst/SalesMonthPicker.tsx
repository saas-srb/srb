"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { isMonth } from "@/lib/products/cashflow-ai/gst/core";

/** Month box for the GST pages: changing it reloads the page for that month (`?month=YYYY-MM`). */
export default function SalesMonthPicker({ month, basePath }: { month: string; basePath: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Month</span>
      <Input
        type="month"
        value={month}
        onChange={(e) => {
          if (isMonth(e.target.value)) router.push(`${basePath}?month=${e.target.value}`);
        }}
        className="w-44"
      />
    </label>
  );
}
