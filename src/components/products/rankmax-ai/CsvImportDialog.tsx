"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ImportResult = { ok: boolean; error?: string; created?: number; updated?: number; imported?: number; failed?: number; errors?: string[] };

/** Upload a CSV and hand its text to an import server action; shows the row-level result. */
export default function CsvImportDialog({
  title,
  description,
  columns,
  withSource = true,
  onImport,
  trigger,
}: {
  title: string;
  description: ReactNode;
  columns: string;
  withSource?: boolean;
  onImport: (csv: string, source: string) => Promise<ImportResult>;
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("File is larger than 4 MB.");
      return;
    }
    startTransition(async () => {
      const text = await file.text();
      const res = await onImport(text, source);
      setResult(res);
      if (!res.ok) toast.error(res.error ?? "Import failed.");
      else {
        toast.success("Import finished");
        router.refresh();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setFile(null);
          setResult(null);
        }
      }}
    >
      <DialogTrigger render={<span className="contents" />}>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm">
            <Upload className="size-3.5" data-icon="inline-start" />
            Import CSV
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 pb-2">
            <p className="rounded-lg bg-muted/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{columns}</p>
            <div className="space-y-1.5">
              <Label htmlFor="csv-file">CSV file</Label>
              <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            {withSource && (
              <div className="space-y-1.5">
                <Label htmlFor="csv-source">Data source</Label>
                <Input id="csv-source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Ahrefs, Semrush, Search Console export" maxLength={60} />
                <p className="text-[11px] text-muted-foreground">Recorded on every row so imported (third-party) figures stay labelled as estimates.</p>
              </div>
            )}
            {result?.ok && (
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
                {[result.created !== undefined && `${result.created} created`, result.updated !== undefined && `${result.updated} updated`, result.imported !== undefined && `${result.imported} imported`, result.failed ? `${result.failed} skipped` : null].filter(Boolean).join(" · ")}
              </div>
            )}
            {result?.errors && result.errors.length > 0 && (
              <ul className="max-h-32 list-disc overflow-y-auto rounded-lg bg-amber-500/10 py-2 pr-2 pl-6 text-xs text-amber-900 dark:text-amber-200">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!file || pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
