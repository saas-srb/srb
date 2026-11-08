"use client";

import { useRouter } from "next/navigation";

const sel = "mt-1 block h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground";

/** Financial year box: changing it reloads the page for that year (`?fy=2026-27`), the same address the other income-tax tabs carry. */
export default function ReturnFyPicker({ fy, options }: { fy: string; options: string[] }) {
  const router = useRouter();
  return (
    <label className="text-xs text-muted-foreground">
      Financial year
      <select aria-label="Financial year" value={fy} onChange={(e) => router.push(`/cashflow-ai/income-tax/returns?fy=${e.target.value}`)} className={sel}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
