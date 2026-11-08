"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, LoaderCircle, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FILE_CATEGORY_SUGGESTIONS, KB_EXTENSIONS, MAX_UPLOAD_BYTES } from "@/lib/products/agentos/constants";

/**
 * The knowledge-file upload queue, shared by the Create Bot form (files are
 * queued before the bot exists and uploaded right after it's saved) and the
 * bot's Knowledge Base tab. Files always go to ONE bot's upload route, which
 * puts them in that bot's own OpenAI vector store.
 */

export const KB_ACCEPT = KB_EXTENSIONS.map((e) => `.${e}`).join(",");

export function fileSize(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export async function postKnowledgeFile(botId: string, form: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/agentos/bots/${botId}/files`, { method: "POST", body: form });
    return await res.json().catch(() => ({ ok: false, error: res.status === 413 ? "That file is too large." : "Upload failed." }));
  } catch {
    return { ok: false, error: "Network error — the upload didn't finish." };
  }
}

export function CategoryInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <Input id={id} list={`${id}-list`} maxLength={60} value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. Case Studies" />
      <datalist id={`${id}-list`}>
        {FILE_CATEGORY_SUGGESTIONS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}

type ItemState = "queued" | "uploading" | "done" | "error";
export interface QueueItem {
  key: number;
  file: File;
  title: string;
  state: ItemState;
  error?: string;
}

export function useKnowledgeQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [running, setRunning] = useState(false);
  const seq = useRef(0);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  function add(list: FileList | File[] | null) {
    if (!list) return;
    const next = Array.from(list).map((file): QueueItem => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const error = !KB_EXTENSIONS.includes(ext) ? "Unsupported type" : file.size > MAX_UPLOAD_BYTES ? `Over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` : file.size === 0 ? "Empty file" : undefined;
      return { key: ++seq.current, file, title: file.name.replace(/\.[^.]+$/, ""), state: error ? "error" : "queued", error };
    });
    setItems((q) => [...q.filter((x) => x.state !== "done"), ...next]);
  }

  const patch = (key: number, p: Partial<QueueItem>) => setItems((q) => q.map((x) => (x.key === key ? { ...x, ...p } : x)));

  /** Uploads every queued file to `botId`, one at a time. Returns how many succeeded / failed. */
  async function uploadAll(botId: string): Promise<{ ok: number; failed: number }> {
    setRunning(true);
    let ok = 0;
    let failed = 0;
    for (const item of itemsRef.current.filter((x) => x.state === "queued")) {
      patch(item.key, { state: "uploading" });
      const form = new FormData();
      form.set("file", item.file);
      form.set("title", item.title);
      form.set("category", category);
      form.set("description", description);
      const res = await postKnowledgeFile(botId, form);
      if (res.ok) ok++;
      else failed++;
      patch(item.key, { state: res.ok ? "done" : "error", error: res.error });
    }
    setRunning(false);
    return { ok, failed };
  }

  return {
    items,
    add,
    remove: (key: number) => setItems((q) => q.filter((x) => x.key !== key)),
    setTitle: (key: number, title: string) => patch(key, { title }),
    clear: () => setItems([]),
    pending: items.filter((x) => x.state === "queued").length,
    category,
    setCategory,
    description,
    setDescription,
    running,
    uploadAll,
  };
}

export type KnowledgeQueueState = ReturnType<typeof useKnowledgeQueue>;

/** Drop zone + queued files (editable titles) + shared category/description. */
export default function KnowledgeQueueFields({ queue, disabled, idPrefix = "kb" }: { queue: KnowledgeQueueState; disabled?: boolean; idPrefix?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = disabled || queue.running;
  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={KB_ACCEPT}
        className="hidden"
        onChange={(e) => {
          queue.add(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={locked}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!locked) queue.add(e.dataTransfer.files);
        }}
        className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
      >
        <Upload className="size-5" />
        <span className="font-medium text-foreground">Drop files here or click to choose</span>
        <span className="text-[11px]">PDF, Word, text, Markdown, PowerPoint, HTML, JSON, CSV or Excel · up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB each. CSV and Excel are converted to text first.</span>
      </button>
      {queue.items.length > 0 && (
        <>
          <ul className="space-y-1.5">
            {queue.items.map((q) => (
              <li key={q.key} className="flex items-center gap-2 rounded-xl border border-border/50 px-3 py-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <Input value={q.title} disabled={q.state !== "queued" || locked} onChange={(e) => queue.setTitle(q.key, e.target.value)} aria-label={`Title for ${q.file.name}`} className="h-8 min-w-0 flex-1" />
                <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{fileSize(q.file.size)}</span>
                <span className="w-24 shrink-0 text-right text-[11px]">
                  {q.state === "uploading" && <LoaderCircle className="ml-auto size-4 animate-spin text-primary" />}
                  {q.state === "done" && <span className="text-emerald-600">Uploaded</span>}
                  {q.state === "error" && <span className="text-destructive">{q.error ?? "Failed"}</span>}
                  {q.state === "queued" && !locked && (
                    <button type="button" onClick={() => queue.remove(q.key)} aria-label={`Remove ${q.file.name}`} className="text-muted-foreground hover:text-foreground">
                      <X className="ml-auto size-4" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-cat`}>Category for these files</Label>
              <CategoryInput id={`${idPrefix}-cat`} value={queue.category} onChange={queue.setCategory} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-desc`}>Description (optional)</Label>
              <Input id={`${idPrefix}-desc`} maxLength={500} value={queue.description} onChange={(e) => queue.setDescription(e.target.value)} placeholder="What these files contain" disabled={locked} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
