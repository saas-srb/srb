"use client";

import { useRouter } from "next/navigation";

// A select that moves to the chosen year, so the page needs no form button. Years are passed in by the server.
export default function TdsCreditsFyPicker({ fy, options }: { fy: string; options: string[] }) {
  const router = useRouter();
  return (
    <label className="text-xs text-muted-foreground">
      Financial year
      <select value={fy} onChange={(e) => router.push(`/cashflow-ai/tds/credits?fy=${encodeURIComponent(e.target.value)}`)} className="mt-1 block h-9 rounded-lg border border-border bg-background px-2 text-sm">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
