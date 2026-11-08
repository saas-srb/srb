"use client";

import { useRef, useState } from "react";
import { FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import type { Attachment } from "@/lib/support/types";

const MAX_FILES = 5;
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain";

export const attachmentUrl = (key: string) => `/api/resolveiq/attachments?key=${encodeURIComponent(key)}`;

/** Upload state for a form: files go to the server as soon as they are chosen (or pasted), so submit only sends their keys. */
export function useAttachments() {
  const [items, setItems] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);

  async function add(files: File[]) {
    const room = MAX_FILES - items.length;
    if (room <= 0) return toast.error(`You can attach up to ${MAX_FILES} files.`);
    for (const file of files.slice(0, room)) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name || "That file"} is over 4 MB.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.set("file", file, file.name || "screenshot.png");
        const res = await fetch("/api/resolveiq/attachments", { method: "POST", body: fd });
        const json = (await res.json()) as Attachment & { error?: string };
        if (!res.ok) toast.error(json.error ?? "Upload failed.");
        else setItems((cur) => (cur.length >= MAX_FILES ? cur : [...cur, json]));
      } catch {
        toast.error("Upload failed. Please try again.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  /** Pass to a textarea's onPaste so a screenshot on the clipboard attaches itself. */
  function onPaste(e: React.ClipboardEvent) {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) {
      e.preventDefault();
      void add(files);
    }
  }

  return { items, uploading, add, onPaste, remove: (key: string) => setItems((cur) => cur.filter((a) => a.key !== key)), reset: () => setItems([]) };
}

export function AttachmentPicker({ state, label = "Attach screenshot or file" }: { state: ReturnType<typeof useAttachments>; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => input.current?.click()} disabled={state.uploading > 0 || state.items.length >= MAX_FILES} className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50">
          {state.uploading > 0 ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />} {label}
        </button>
        <span className="text-[11px] text-muted-foreground">Images, PDF or text · up to {MAX_FILES} files, 4 MB each · you can also paste a screenshot into the box above</span>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { void state.add([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>
      {state.items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {state.items.map((a) => (
            <li key={a.key} className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 py-1 pr-1 pl-2 text-xs">
              {a.type.startsWith("image/") ? <ImageIcon className="size-3.5 text-primary" /> : <FileText className="size-3.5 text-primary" />}
              <span className="max-w-40 truncate">{a.name}</span>
              <button type="button" onClick={() => state.remove(a.key)} aria-label={`Remove ${a.name}`} className="rounded p-0.5 text-muted-foreground hover:text-destructive"><X className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Read-only list of files on a request or message. Images show as thumbnails; everything opens through the authenticated route. */
export function AttachmentList({ items }: { items: Attachment[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {items.map((a) => (
        <li key={a.key}>
          <a href={attachmentUrl(a.key)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-border/50 bg-muted/30 text-xs transition-colors hover:border-primary/40">
            {a.type.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={attachmentUrl(a.key)} alt={a.name} className="h-24 w-auto max-w-48 object-cover" />
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1.5"><FileText className="size-3.5 text-primary" /> {a.name}</span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
