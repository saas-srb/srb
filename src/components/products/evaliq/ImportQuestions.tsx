"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PreviewRow {
  line: number;
  ok: boolean;
  error: string | null;
  type: string;
  prompt: string;
}

export default function ImportQuestions() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);

  async function send(commit: boolean) {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("commit", commit ? "1" : "0");
      const res = await fetch("/api/evaliq/questions/import", { method: "POST", body: fd });
      const json = (await res.json()) as { preview?: PreviewRow[]; created?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Import failed.");
      setPreview(json.preview ?? []);
      if (commit) {
        toast.success(`${json.created} question${json.created === 1 ? "" : "s"} imported`);
        router.push("/evaliq/questions?sort=created");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const valid = preview?.filter((p) => p.ok).length ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,.xlsx"
          aria-label="Question file"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
          }}
          className="text-sm file:mr-3 file:rounded-lg file:border file:border-border/60 file:bg-background file:px-3 file:py-1.5 file:text-sm"
        />
        <Button type="button" variant="outline" disabled={!file || busy} onClick={() => send(false)}>
          {busy && !preview ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Check file
        </Button>
        {preview && valid > 0 && (
          <Button type="button" disabled={busy} onClick={() => send(true)}>
            {busy && <Loader2 className="size-3.5 animate-spin" />} {`Import ${valid} valid question${valid === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>
      {preview && (
        <div className="space-y-2">
          <p className="text-sm">
            <span className="font-semibold text-emerald-600">{`${valid} valid`}</span> · <span className="font-semibold text-rose-600">{`${preview.length - valid} with errors (skipped)`}</span>
          </p>
          <div className="max-h-[55vh] overflow-auto rounded-xl border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((p) => (
                  <TableRow key={p.line}>
                    <TableCell className="tabular-nums">{p.line}</TableCell>
                    <TableCell className="text-xs">{p.type}</TableCell>
                    <TableCell className="max-w-md truncate text-xs">{p.prompt}</TableCell>
                    <TableCell className="text-xs">{p.ok ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="size-3.5" /> OK</span> : <span className="flex items-center gap-1 text-rose-600"><XCircle className="size-3.5" /> {p.error}</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
