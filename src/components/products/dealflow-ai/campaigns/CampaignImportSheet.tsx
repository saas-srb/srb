"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, FileDown, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CAMPAIGN_PLATFORMS, type CampaignPlatform, type ImportKind } from "@/lib/campaign-platforms";

interface ImportResult {
  status: "completed" | "completed_with_errors" | "failed" | "reverted";
  kind: ImportKind;
  rowsTotal: number;
  rowsImported: number;
  rowsUpdated: number;
  rowsError: number;
  errors: { row: number; message: string }[];
  currency?: string;
  leadsMatched?: number;
  leadsUnmatched?: number;
  unmatchedSample?: { campaign: string; email?: string; phone?: string }[];
}

const KINDS: { value: ImportKind; label: string; hint: string }[] = [
  { value: "performance", label: "Performance report", hint: "Daily spend / impressions / clicks per campaign." },
  { value: "leads", label: "Lead list export", hint: "Lead contacts + campaign — matched to existing leads." },
];

export default function CampaignImportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [platform, setPlatform] = useState<CampaignPlatform>("meta");
  const [kind, setKind] = useState<ImportKind>("performance");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setFile(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (!file) return;
    setPending(true);
    setResult(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("platform", platform);
      body.set("kind", kind);
      const res = await fetch("/api/dealflow-ai/campaigns/import", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok && !json?.result) {
        toast.error(json?.error ?? "Import failed.");
        return;
      }
      const r: ImportResult = json.result;
      setResult(r);
      if (r.status === "failed") {
        toast.error("Nothing imported — see the errors below.");
      } else if (r.kind === "performance") {
        toast.success(`Imported ${r.rowsImported} new + ${r.rowsUpdated} updated row${r.rowsImported + r.rowsUpdated === 1 ? "" : "s"}.`);
        router.refresh();
      } else {
        toast.success(`Matched ${r.leadsMatched ?? 0} lead${r.leadsMatched === 1 ? "" : "s"} to campaigns.`);
        router.refresh();
      }
    } catch {
      toast.error("Network error — try again.");
    } finally {
      setPending(false);
    }
  }

  const templateHref = `/api/dealflow-ai/campaigns/template?platform=${platform}&kind=${kind}`;

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Import campaign data</SheetTitle>
          <SheetDescription>Upload a CSV exported from the ad platform.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Platform</label>
              <Select value={platform} onValueChange={(v) => { if (v) { setPlatform(v as CampaignPlatform); setResult(null); } }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_PLATFORMS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.shortLabel}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={kind} onValueChange={(v) => { if (v) { setKind(v as ImportKind); setResult(null); } }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{KINDS.find((k) => k.value === kind)!.hint}</p>

          <a href={templateHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <FileDown className="size-3.5" data-icon="inline-start" />
            Download {platform} {kind} template
          </a>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">CSV file</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70"
            />
          </div>

          <Button type="button" onClick={submit} disabled={!file || pending} className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <><Upload className="size-4" data-icon="inline-start" /> Import</>}
          </Button>

          {result && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                {result.status === "failed" ? (
                  <AlertTriangle className="size-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
                )}
                {result.status === "failed" ? "Import rejected" : "Import complete"}
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Rows in file</dt>
                <dd className="text-right tabular-nums">{result.rowsTotal}</dd>
                {result.kind === "performance" ? (
                  <>
                    <dt className="text-muted-foreground">New rows</dt>
                    <dd className="text-right tabular-nums">{result.rowsImported}</dd>
                    <dt className="text-muted-foreground">Updated rows</dt>
                    <dd className="text-right tabular-nums">{result.rowsUpdated}</dd>
                    {result.currency && <><dt className="text-muted-foreground">Currency</dt><dd className="text-right">{result.currency}</dd></>}
                  </>
                ) : (
                  <>
                    <dt className="text-muted-foreground">Leads matched</dt>
                    <dd className="text-right tabular-nums">{result.leadsMatched ?? 0}</dd>
                    <dt className="text-muted-foreground">Unmatched rows</dt>
                    <dd className="text-right tabular-nums">{result.leadsUnmatched ?? 0}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Skipped (errors)</dt>
                <dd className="text-right tabular-nums">{result.rowsError}</dd>
              </dl>

              {result.errors.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-destructive">Errors</p>
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                    {result.errors.map((e, i) => (
                      <li key={i}>Line {e.row}: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.unmatchedSample && result.unmatchedSample.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Sample unmatched leads</p>
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                    {result.unmatchedSample.map((u, i) => (
                      <li key={i}>{u.email || u.phone || "—"} · {u.campaign}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
