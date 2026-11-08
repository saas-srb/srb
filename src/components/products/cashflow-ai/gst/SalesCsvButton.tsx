"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadSalesCsvAction } from "@/app/(products)/cashflow-ai/(protected)/gst/sales/actions";

export default function SalesCsvButton({ month, disabled }: { month: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  function download() {
    start(async () => {
      const res = await downloadSalesCsvAction(month);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // BOM so Excel reads rupee names and accents as UTF-8
      const url = URL.createObjectURL(new Blob(["﻿", res.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  return (
    <Button type="button" variant="outline" onClick={download} disabled={pending || disabled}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" data-icon="inline-start" />}
      Download CSV
    </Button>
  );
}
