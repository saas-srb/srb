"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadTdsCreditsAction } from "@/app/(products)/cashflow-ai/(protected)/tds/credits/actions";

export default function TdsCreditsUploadForm({ fy, hasUpload }: { fy: string; hasUpload: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      ref={ref}
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("fy", fy);
        start(async () => {
          try {
            const r = await uploadTdsCreditsAction(fd);
            if (r.ok) {
              toast.success(r.message);
              ref.current?.reset();
              router.refresh();
            } else toast.error(r.error);
          } catch {
            toast.error("Could not upload. Please try again.");
          }
        });
      }}
    >
      <label className="text-xs text-muted-foreground">
        Form 26AS credits for {fy} (CSV)
        <input type="file" name="file" required accept=".csv,text/csv" className="mt-1 block h-9 rounded-lg border border-border bg-background px-2 py-1 text-sm" />
      </label>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Reading file…" : hasUpload ? "Replace this year's file" : "Upload and match"}</Button>
    </form>
  );
}
