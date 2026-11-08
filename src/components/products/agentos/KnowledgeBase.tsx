"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookLock, CheckCircle2, CircleAlert, Eye, FileText, LoaderCircle, MessageSquareText, Pencil, RefreshCw, Trash2, Upload, CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard, EmptyState } from "@/components/products/agentos/AibotsUi";
import ActionButton from "@/components/products/agentos/ActionButton";
import KnowledgeQueueFields, { CategoryInput, KB_ACCEPT, fileSize, postKnowledgeFile, useKnowledgeQueue } from "@/components/products/agentos/KnowledgeQueue";
import { cn } from "@/lib/utils";
import { deleteFileAction, refreshFilesAction, setFileEnabledAction, updateFileMetaAction, viewFileAction } from "@/app/(products)/agentos/(protected)/actions";
import { FILE_STATUS_LABEL, KB_CONVERTED_EXTENSIONS, type KbFileStatus } from "@/lib/products/agentos/constants";
import type { KbFileView } from "@/lib/products/agentos/knowledge";

/** Files that count as the bot's assigned knowledge base (mirrors `countAssignedFiles` on the server). */
export const isAssigned = (f: Pick<KbFileView, "enabled" | "status">) => f.enabled && (f.status === "ready" || f.status === "processing");

/** Which answer mode the bot is in — shown wherever the knowledge base is managed. */
export function AnswerModeNotice({ assigned }: { assigned: number }) {
  return assigned > 0 ? (
    <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950 dark:text-emerald-100">
      <BookLock className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>Answers only from the knowledge base.</strong>{" "}
        {`This bot searches its ${assigned} assigned file${assigned === 1 ? "" : "s"} on every message and answers strictly from them — it won't use outside knowledge, and says so when the answer isn't in the files. Disabled files don't count.`}
      </p>
    </div>
  ) : (
    <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-sm text-foreground">
      <MessageSquareText className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>Answers from instructions only.</strong> No knowledge base is assigned, so the bot answers from its configured instructions. Upload (or enable) a file to switch it to knowledge-base-only answers.
      </p>
    </div>
  );
}

function StatusPill({ status, error }: { status: KbFileStatus; error: string | null }) {
  const cls = {
    ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    processing: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    failed: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    disabled: "bg-muted text-muted-foreground",
  }[status];
  const Icon = { ready: CheckCircle2, processing: LoaderCircle, failed: CircleAlert, disabled: CircleSlash }[status];
  return (
    <span title={error ?? undefined} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", cls)}>
      <Icon className={cn("size-3", status === "processing" && "animate-spin")} />
      {FILE_STATUS_LABEL[status]}
    </span>
  );
}

/** New files: pick several, give them a shared category/description, upload one by one. */
function Uploader({ botId, disabled }: { botId: string; disabled: boolean }) {
  const router = useRouter();
  const queue = useKnowledgeQueue();

  async function upload() {
    const { ok } = await queue.uploadAll(botId);
    if (ok) {
      toast.success(`${ok} file${ok === 1 ? "" : "s"} sent to OpenAI for indexing.`);
      router.refresh();
    }
  }

  return (
    <SectionCard title="Upload knowledge" description="Files go straight to this bot's own OpenAI vector store — no other bot can search them.">
      <KnowledgeQueueFields queue={queue} disabled={disabled} />
      {queue.items.length > 0 && (
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={queue.clear} disabled={queue.running}>
            Clear
          </Button>
          <Button type="button" onClick={upload} disabled={queue.running || queue.pending === 0}>
            {queue.running ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload {queue.pending || ""} file{queue.pending === 1 ? "" : "s"}
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

function ViewDialog({ botId, file, onClose }: { botId: string; file: KbFileView; onClose: () => void }) {
  const [state, setState] = useState<{ loading: boolean; text?: string; truncated?: boolean; error?: string }>({ loading: true });
  useEffect(() => {
    let live = true;
    viewFileAction(botId, file._id).then((res) => {
      if (!live) return;
      setState(res.ok ? { loading: false, text: res.text, truncated: res.truncated } : { loading: false, error: res.error });
    });
    return () => {
      live = false;
    };
  }, [botId, file._id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{file.title}</DialogTitle>
          <DialogDescription>
            {file.filename} · the text OpenAI indexed for this bot&apos;s knowledge base{file.converted ? " (converted from a spreadsheet)" : ""}.
          </DialogDescription>
        </DialogHeader>
        {state.loading ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Loading from OpenAI…
          </p>
        ) : state.error ? (
          <p className="py-6 text-sm text-destructive">{state.error}</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-border/60 bg-muted/30 p-3">
            <pre className="font-mono text-xs whitespace-pre-wrap text-foreground">{state.text || "(No text was extracted from this file.)"}</pre>
            {state.truncated && <p className="mt-2 text-[11px] text-muted-foreground">Showing the first part only.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ botId, file, onClose }: { botId: string; file: KbFileView; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(file.title);
  const [category, setCategory] = useState(file.category);
  const [description, setDescription] = useState(file.description);
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit file details</DialogTitle>
          <DialogDescription>{file.filename}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="kf-title">Title</Label>
            <Input id="kf-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kf-cat">Category</Label>
            <CategoryInput id="kf-cat" value={category} onChange={setCategory} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kf-desc">Description</Label>
            <Textarea id="kf-desc" rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await updateFileMetaAction(botId, file._id, { title, category, description });
                if (!res.ok) return void toast.error(res.error);
                toast.success("File details saved");
                onClose();
                router.refresh();
              })
            }
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReplaceButton({ botId, file }: { botId: string; file: KbFileView }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={KB_ACCEPT}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          const form = new FormData();
          form.set("file", f);
          form.set("fileId", file._id);
          const res = await postKnowledgeFile(botId, form);
          setBusy(false);
          if (!res.ok) return void toast.error(res.error ?? "Upload failed.");
          toast.success(`${file.title} replaced — re-indexing in OpenAI.`);
          router.refresh();
        }}
      />
      <Button size="icon-xs" variant="ghost" disabled={busy} onClick={() => ref.current?.click()} aria-label={`Replace ${file.title}`} title="Upload a new version">
        {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      </Button>
    </>
  );
}

export default function KnowledgeBase({
  botId,
  files,
  can,
  openAIReady,
}: {
  botId: string;
  files: KbFileView[];
  can: { upload: boolean; manage: boolean; del: boolean };
  openAIReady: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<KbFileView | null>(null);
  const [viewing, setViewing] = useState<KbFileView | null>(null);
  const processing = files.some((f) => f.status === "processing");

  // While OpenAI is still indexing, poll its real status.
  useEffect(() => {
    if (!processing || !openAIReady) return;
    const t = setInterval(async () => {
      await refreshFilesAction(botId);
      router.refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [processing, openAIReady, botId, router]);

  const ready = files.filter((f) => f.status === "ready").length;

  return (
    <div className="space-y-4">
      <AnswerModeNotice assigned={files.filter(isAssigned).length} />
      {can.upload && <Uploader botId={botId} disabled={!openAIReady} />}
      <SectionCard
        title={`Knowledge files (${files.length})`}
        description={`${ready} searchable${processing ? " · indexing in OpenAI…" : ""}. Only this bot can search these files.`}
      >
        {files.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" />} title="No knowledge files yet">
            Without files the bot answers from its configured instructions. Once a file is uploaded it answers only from its knowledge base.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-semibold">File</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 font-semibold">Size</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Updated</th>
                  <th className="py-2 pl-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {files.map((f) => (
                  <tr key={f._id} className={cn(!f.enabled && "opacity-60")}>
                    <td className="max-w-72 py-2 pr-3">
                      <p className="truncate font-medium">{f.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {f.filename}
                        {f.version > 1 && ` · v${f.version}`}
                        {f.converted && KB_CONVERTED_EXTENSIONS.includes(f.extension) && " · converted to text"}
                      </p>
                      {f.description && <p className="line-clamp-1 text-[11px] text-muted-foreground">{f.description}</p>}
                      {f.status === "failed" && f.lastError && <p className="line-clamp-2 text-[11px] text-destructive">{f.lastError}</p>}
                    </td>
                    <td className="px-3 py-2 text-xs">{f.category}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{fileSize(f.size)}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={f.status} error={f.lastError} />
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-muted-foreground">{new Date(f.updatedAt).toLocaleDateString()}</td>
                    <td className="py-2 pl-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button size="icon-xs" variant="ghost" onClick={() => setViewing(f)} aria-label={`View ${f.title}`} title="View indexed content">
                          <Eye className="size-3.5" />
                        </Button>
                        {can.manage && (
                          <>
                            <ActionButton
                              variant="ghost"
                              size="xs"
                              action={() => setFileEnabledAction(botId, f._id, !f.enabled)}
                              success={f.enabled ? "File disabled — the bot can no longer search it" : "File enabled — re-indexing"}
                              aria-label={f.enabled ? `Disable ${f.title}` : `Enable ${f.title}`}
                            >
                              {f.enabled ? "Disable" : "Enable"}
                            </ActionButton>
                            <Button size="icon-xs" variant="ghost" onClick={() => setEditing(f)} aria-label={`Edit ${f.title}`}>
                              <Pencil className="size-3.5" />
                            </Button>
                          </>
                        )}
                        {can.upload && openAIReady && <ReplaceButton botId={botId} file={f} />}
                        {can.del && (
                          <ActionButton
                            variant="ghost"
                            size="icon-xs"
                            action={() => deleteFileAction(botId, f._id)}
                            success="File deleted from the knowledge base"
                            aria-label={`Delete ${f.title}`}
                            confirm={{ title: `Delete “${f.title}”?`, description: "It is removed from this bot's OpenAI vector store and deleted from OpenAI. This can't be undone.", confirmLabel: "Delete" }}
                          >
                            <Trash2 className="size-3.5" />
                          </ActionButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {processing && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" /> Checking OpenAI for indexing progress every few seconds.
          </p>
        )}
      </SectionCard>
      {editing && <EditDialog botId={botId} file={editing} onClose={() => setEditing(null)} />}
      {viewing && <ViewDialog botId={botId} file={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
