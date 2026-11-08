"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportPostsCsvAction } from "@/app/(products)/viralpulse-ai/(protected)/analytics/actions";

/** Downloads the filtered Posts & Reels table (with the time each number was read from the platform) as a CSV file. */
export default function ExportCsvButton({ filters }: { filters: Record<string, string | undefined> }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await exportPostsCsvAction(filters);
          if (!r.ok) return void toast.error(r.error);
          if (r.rows === 0) return void toast.info("No posts match these filters, so there is nothing to export.");
          const url = URL.createObjectURL(new Blob([`﻿${r.csv}`], { type: "text/csv;charset=utf-8" }));
          const a = Object.assign(document.createElement("a"), { href: url, download: r.filename });
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          toast.success(`Exported ${r.rows} post${r.rows === 1 ? "" : "s"}.`);
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Export CSV
    </Button>
  );
}
