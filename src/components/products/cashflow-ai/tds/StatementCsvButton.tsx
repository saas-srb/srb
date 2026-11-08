"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadStatementCsvAction } from "@/app/(products)/cashflow-ai/(protected)/tds/statement/actions";

export default function StatementCsvButton({ fy, quarter, disabled }: { fy: string; quarter: number; disabled?: boolean }) {
  const [pending, start] = useTransition();
  function download() {
    start(async () => {
      try {
        const res = await downloadStatementCsvAction(fy, quarter);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        // BOM so Excel reads names and accents as UTF-8
        const url = URL.createObjectURL(new Blob(["﻿", res.csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        toast.error("Could not prepare the file. Please try again.");
      }
    });
  }
  return (
    <Button type="button" variant="outline" onClick={download} disabled={pending || disabled}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" data-icon="inline-start" />}
      Download CSV for your CA
    </Button>
  );
}
