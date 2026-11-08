"use client";

import { useRouter } from "next/navigation";
import { QUARTER_LABEL } from "@/lib/products/cashflow-ai/tds/statement";
import type { Quarter } from "@/lib/products/cashflow-ai/tds/core";

const sel = "mt-1 block h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground";

/** Financial year and quarter boxes: changing either reloads the page for that quarter (`?fy=2026-27&q=2`). */
export default function TdsPeriodPicker({ fy, quarter, basePath, fyOptions }: { fy: string; quarter: Quarter; basePath: string; fyOptions: string[] }) {
  const router = useRouter();
  const go = (nextFy: string, nextQ: number) => router.push(`${basePath}?fy=${nextFy}&q=${nextQ}`);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs text-muted-foreground">
        Financial year
        <select aria-label="Financial year" value={fy} onChange={(e) => go(e.target.value, quarter)} className={sel}>
          {fyOptions.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">
        Quarter
        <select aria-label="Quarter" value={quarter} onChange={(e) => go(fy, Number(e.target.value))} className={sel}>
          {([1, 2, 3, 4] as Quarter[]).map((q) => <option key={q} value={q}>{QUARTER_LABEL[q]}</option>)}
        </select>
      </label>
    </div>
  );
}
