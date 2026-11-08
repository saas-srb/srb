"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  Globe,
  Loader2,
  RefreshCw,
  TriangleAlert,
  Upload,
  Trash2,
} from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { cn, formatDateTime } from "@/lib/utils";
import {
  triggerWebsiteIndexAction,
  reindexPagesAction,
  reindexPdfAction,
  deletePdfAction,
} from "@/app/(products)/commandos/(protected)/chatbot/actions";
import type { SerializedKbWebsitePage, WebsiteKbSummary } from "@/lib/kb-website";
import type { SerializedKbPdfDocument, PdfKbSummary } from "@/lib/kb-pdf";
import type { SerializedKbRun } from "@/lib/kb-runs";

type Status = SerializedKbWebsitePage["status"];

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    indexed: "bg-green-500/15 text-green-600 dark:text-green-400",
    pending: "bg-primary/15 text-primary",
    failed: "bg-destructive/15 text-destructive",
    stale: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", map[status])}>
      {status}
    </span>
  );
}

function bytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function KnowledgeBaseManager({
  openAiConfigured,
  vectorStoreId,
  websiteSummary,
  pages,
  pdfSummary,
  pdfs,
  initialRuns,
}: {
  openAiConfigured: boolean;
  vectorStoreId: string | null;
  websiteSummary: WebsiteKbSummary;
  pages: SerializedKbWebsitePage[];
  pdfSummary: PdfKbSummary;
  pdfs: SerializedKbPdfDocument[];
  initialRuns: SerializedKbRun[];
}) {
  const router = useRouter();
  const [runs, setRuns] = React.useState(initialRuns);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [selectedPages, setSelectedPages] = React.useState<Set<string>>(new Set());
  const [pdfTitle, setPdfTitle] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const replaceRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const anyRunning = runs.some((r) => r.status === "running");

  // Poll run status while something is indexing; refresh the page when it settles.
  React.useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/dealflow-ai/chatbot/reindex", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setRuns(data.runs);
        if (!data.runs.some((r: SerializedKbRun) => r.status === "running")) {
          router.refresh();
        }
      } catch {
        /* ignore */
      }
    }, 3500);
    return () => clearInterval(timer);
  }, [anyRunning, router]);

  async function runWebsiteIndex(mode: "full" | "incremental") {
    setBusy(mode);
    const res = await triggerWebsiteIndexAction(mode);
    setBusy(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`${mode === "full" ? "Full" : "Incremental"} re-index started`);
    router.refresh();
  }

  async function reindexSelected() {
    if (selectedPages.size === 0) return;
    setBusy("selected");
    const res = await reindexPagesAction([...selectedPages]);
    setBusy(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Re-indexing ${selectedPages.size} page(s)`);
    setSelectedPages(new Set());
    router.refresh();
  }

  async function uploadPdf(file: File, replaceId?: string) {
    setUploading(true);
    const body = new FormData();
    body.set("file", file);
    if (pdfTitle && !replaceId) body.set("title", pdfTitle);
    if (replaceId) body.set("replaceId", replaceId);
    try {
      const res = await fetch("/api/dealflow-ai/chatbot/kb/pdf", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Upload failed.");
        return;
      }
      toast.success(replaceId ? "Document replaced and re-indexed" : "Document uploaded and indexed");
      setPdfTitle("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function reindexOnePdf(id: string) {
    setBusy(`pdf-${id}`);
    const res = await reindexPdfAction(id);
    setBusy(null);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Document re-indexed");
      router.refresh();
    }
  }

  async function removePdf(id: string) {
    const res = await deletePdfAction(id);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Document deleted");
      router.refresh();
    }
  }

  const allPagesSelected = pages.length > 0 && pages.every((p) => selectedPages.has(p._id));

  return (
    <div className="space-y-4">
      {!openAiConfigured && (
        <GlassCard interactive={false} className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">OpenAI isn&apos;t connected.</span> Add your key in Workspace → Settings → Integrations. Indexing is disabled
              until it is configured in the server environment.
            </p>
          </CardContent>
        </GlassCard>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard icon={<Globe className="size-4" />} label="Pages indexed" value={`${websiteSummary.indexedPages}/${websiteSummary.totalPages}`} />
        <KpiCard icon={<FileText className="size-4" />} label="Documents indexed" value={`${pdfSummary.indexedDocs}/${pdfSummary.totalDocs}`} />
        <KpiCard icon={<Database className="size-4" />} label="Total chunks" value={websiteSummary.totalChunks + pdfSummary.totalChunks} />
        <KpiCard
          icon={<BookOpen className="size-4" />}
          label="Vector store"
          value={<span className="text-xs font-mono">{vectorStoreId ? `${vectorStoreId.slice(0, 14)}…` : "not created"}</span>}
        />
      </div>

      {/* Website product */}
      <GlassCard>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Website Content</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Crawls every public page + a curated company-facts document.
              {websiteSummary.lastIndexedAt && ` Last indexed ${formatDateTime(websiteSummary.lastIndexedAt)}.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!openAiConfigured || anyRunning || busy !== null}
              onClick={() => runWebsiteIndex("incremental")}
            >
              {busy === "incremental" ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <RefreshCw className="size-3.5" data-icon="inline-start" />}
              Incremental
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!openAiConfigured || anyRunning || busy !== null}
              onClick={() => runWebsiteIndex("full")}
            >
              {busy === "full" ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <RefreshCw className="size-3.5" data-icon="inline-start" />}
              Re-index all
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedPages.size > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <span>{selectedPages.size} selected</span>
              <Button type="button" size="xs" disabled={anyRunning || busy !== null} onClick={reindexSelected}>
                Re-index selected
              </Button>
              <button className="text-muted-foreground hover:text-foreground" onClick={() => setSelectedPages(new Set())}>
                Clear
              </button>
            </div>
          )}
          <div className="max-h-[46vh] overflow-auto rounded-lg border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allPagesSelected}
                      onCheckedChange={() =>
                        setSelectedPages(allPagesSelected ? new Set() : new Set(pages.map((p) => p._id)))
                      }
                      aria-label="Select all pages"
                    />
                  </TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>Last indexed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      Nothing indexed yet — run a full re-index to build the knowledge base.
                    </TableCell>
                  </TableRow>
                )}
                {pages.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedPages.has(p._id)}
                        onCheckedChange={() =>
                          setSelectedPages((prev) => {
                            const next = new Set(prev);
                            if (next.has(p._id)) next.delete(p._id);
                            else next.add(p._id);
                            return next;
                          })
                        }
                        aria-label={`Select ${p.path}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-[320px]">
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{p.path}</p>
                      {p.lastError && <p className="truncate text-[11px] text-destructive">{p.lastError}</p>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{p.chunkCount ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.lastIndexedAt ? formatDateTime(p.lastIndexedAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </GlassCard>

      {/* PDF product */}
      <GlassCard>
        <CardHeader>
          <CardTitle>Documents (PDF / Word / Text)</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Company profile, brochures, training material, RFPs, service docs — up to 25 MB each.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/50 bg-muted/20 p-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Title (optional)</label>
              <Input
                value={pdfTitle}
                onChange={(e) => setPdfTitle(e.target.value)}
                placeholder="e.g. Company Profile 2026"
                className="h-8 w-56"
              />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadPdf(file);
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={!openAiConfigured || uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
              ) : (
                <Upload className="size-3.5" data-icon="inline-start" />
              )}
              Upload document
            </Button>
          </div>

          <div className="overflow-auto rounded-lg border border-border/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pdfs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No documents uploaded yet.
                    </TableCell>
                  </TableRow>
                )}
                {pdfs.map((d) => (
                  <TableRow key={d._id}>
                    <TableCell className="max-w-[240px]">
                      <a
                        href={`/api/dealflow-ai/chatbot/kb/${d._id}/download`}
                        className="truncate text-sm font-medium hover:text-primary"
                      >
                        {d.title}
                      </a>
                      <p className="truncate text-[11px] text-muted-foreground">{d.filename}</p>
                      {d.lastError && <p className="truncate text-[11px] text-destructive">{d.lastError}</p>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{d.chunkCount ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{bytes(d.size)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(d.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <input
                          ref={(el) => {
                            replaceRefs.current[d._id] = el;
                          }}
                          type="file"
                          accept=".pdf,.doc,.docx,.txt,.md"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadPdf(file, d._id);
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={uploading}
                          onClick={() => replaceRefs.current[d._id]?.click()}
                        >
                          Replace
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          disabled={busy === `pdf-${d._id}`}
                          onClick={() => reindexOnePdf(d._id)}
                        >
                          {busy === `pdf-${d._id}` ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3" />
                          )}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button type="button" variant="ghost" size="icon-xs" aria-label="Delete document">
                                <Trash2 className="size-3 text-destructive" />
                              </Button>
                            }
                          />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete “{d.title}”?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the file and its embeddings from the knowledge base.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removePdf(d._id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </GlassCard>

      {/* Activity log */}
      <GlassCard>
        <CardHeader>
          <CardTitle>Indexing Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.length === 0 && <p className="text-sm text-muted-foreground">No indexing runs yet.</p>}
          {runs.map((run) => (
            <details key={run._id} className="rounded-lg border border-border/50">
              <summary className="flex cursor-pointer items-center justify-between gap-3 p-3 text-sm">
                <span className="flex items-center gap-2">
                  {run.status === "running" ? (
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                  ) : run.status === "completed" ? (
                    <CheckCircle2 className="size-3.5 text-green-500" />
                  ) : (
                    <TriangleAlert className="size-3.5 text-destructive" />
                  )}
                  <span className="font-medium capitalize">{run.type.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">
                    {run.stats.itemsIndexed} indexed · {run.stats.itemsSkipped} skipped · {run.stats.itemsFailed} failed
                  </span>
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  {formatDateTime(run.startedAt)}
                </span>
              </summary>
              <div className="max-h-48 overflow-auto border-t border-border/50 bg-muted/20 p-3 font-mono text-[11px] leading-relaxed">
                {run.logs.length === 0 && <p className="text-muted-foreground">No log output.</p>}
                {run.logs.map((l, i) => (
                  <p
                    key={i}
                    className={cn(
                      l.level === "error" && "text-destructive",
                      l.level === "warn" && "text-primary"
                    )}
                  >
                    [{l.level}] {l.message}
                  </p>
                ))}
                {run.error && <p className="text-destructive">Error: {run.error}</p>}
              </div>
            </details>
          ))}
        </CardContent>
      </GlassCard>
    </div>
  );
}
