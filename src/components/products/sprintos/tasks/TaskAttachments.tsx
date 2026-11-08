"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip, Download, Trash2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/products/sprintos/document-categories";
import { formatDateTime } from "@/lib/utils";
import type { SerializedAttachment } from "@/lib/products/sprintos/task-attachments";

export default function TaskAttachments({
  taskId,
  attachments,
  currentUserId,
  canUpload,
  canManage,
}: {
  taskId: string;
  attachments: SerializedAttachment[];
  currentUserId: string;
  canUpload: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function upload() {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("taskId", taskId);
      fd.set("file", file);
      const res = await fetch("/api/sprintos/attachments", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.fields?.file ?? json?.error ?? "Upload failed.");
        return;
      }
      toast.success("Attachment uploaded");
      setFile(null);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/sprintos/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete attachment.");
        return;
      }
      toast.success("Attachment removed");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {attachments.length === 0 && <p className="text-sm text-muted-foreground">No attachments.</p>}
      {attachments.map((a) => (
        <div key={a._id} className="flex items-center gap-2 rounded-lg border border-border/60 p-2.5 text-sm">
          <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{a.filename}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(a.size)} · {a.uploadedByEmail ?? "unknown"} · {formatDateTime(a.createdAt)}</p>
          </div>
          <a
            href={`/api/sprintos/attachments/${a._id}`}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Download"
          >
            <Download className="size-3.5" />
          </a>
          {(canManage || a.uploadedBy === currentUserId) && (
            <button
              type="button"
              onClick={() => remove(a._id)}
              disabled={pending}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
              aria-label="Delete"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}

      {canUpload && (
        <div className="flex items-center gap-2">
          <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
          <Button type="button" size="sm" variant="outline" onClick={upload} disabled={!file || uploading}>
            {uploading ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Upload className="size-3.5" data-icon="inline-start" />}
            Upload
          </Button>
        </div>
      )}
    </div>
  );
}
