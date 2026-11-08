"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Download, Trash2, Loader2, FileText, History, UploadCloud } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { PMS_DOCUMENT_CATEGORIES, formatBytes } from "@/lib/products/sprintos/document-categories";
import { formatDateTime } from "@/lib/utils";
import type { SerializedDocument } from "@/lib/products/sprintos/documents";

interface DocGroup {
  current: SerializedDocument;
  versions: SerializedDocument[];
}

export default function DocumentsManager({
  projectId,
  groups,
  canManage,
}: {
  projectId: string;
  groups: DocGroup[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [replacing, setReplacing] = useState<SerializedDocument | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<{ title: string; category: string; notes: string; file: File | null }>({
    title: "",
    category: "other",
    notes: "",
    file: null,
  });
  const [fileError, setFileError] = useState<string | null>(null);

  function openNew() {
    setReplacing(null);
    setForm({ title: "", category: "other", notes: "", file: null });
    setFileError(null);
    setSheetOpen(true);
  }
  function openReplace(doc: SerializedDocument) {
    setReplacing(doc);
    setForm({ title: doc.title, category: doc.category, notes: doc.notes ?? "", file: null });
    setFileError(null);
    setSheetOpen(true);
  }

  async function submit() {
    if (!form.file) {
      setFileError("Select a file.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("file", form.file);
      fd.set("title", form.title);
      fd.set("category", form.category);
      fd.set("notes", form.notes);
      if (replacing) fd.set("replacesId", replacing._id);
      const res = await fetch("/api/sprintos/documents", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFileError(json?.fields?.file ?? null);
        toast.error(json?.error ?? "Upload failed.");
        return;
      }
      toast.success(replacing ? "New version uploaded" : "Document uploaded");
      setSheetOpen(false);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/sprintos/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete document.");
        return;
      }
      toast.success("Document deleted");
      router.refresh();
    });
  }

  const byCategory = PMS_DOCUMENT_CATEGORIES.map((c) => ({
    ...c,
    docs: groups.filter((g) => g.current.category === c.value),
  })).filter((c) => c.docs.length > 0);

  return (
    <GlassCard interactive={false}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2"><FileText className="size-4" /> Documents ({groups.length})</CardTitle>
        {canManage && (
          <Button type="button" size="sm" onClick={openNew}>
            <Plus className="size-3.5" data-icon="inline-start" />
            Upload
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.length === 0 && <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>}
        {byCategory.map((cat) => (
          <div key={cat.value} className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{cat.label}</p>
            {cat.docs.map((g) => (
              <div key={g.current.rootId} className="rounded-lg border border-border/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{g.current.title}</p>
                    <p className="text-xs text-muted-foreground">
                      v{g.current.version} · {formatBytes(g.current.size)} · {g.current.uploadedByEmail ?? "unknown"} · {formatDateTime(g.current.createdAt)}
                    </p>
                    {g.current.notes && <p className="mt-0.5 text-sm text-muted-foreground">{g.current.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={`/api/sprintos/documents/${g.current._id}`}
                      className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Download"
                    >
                      <Download className="size-3.5" />
                    </a>
                    {g.versions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === g.current.rootId ? null : g.current.rootId)}
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Version history"
                      >
                        <History className="size-3.5" />
                      </button>
                    )}
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => openReplace(g.current)}
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Upload new version"
                        >
                          <UploadCloud className="size-3.5" />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <button type="button" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Delete" disabled={pending}>
                                <Trash2 className="size-3.5" />
                              </button>
                            }
                          />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete “{g.current.title}” (v{g.current.version})?</AlertDialogTitle>
                              <AlertDialogDescription>The file is removed from disk. Older versions remain.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(g.current._id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
                {expanded === g.current.rootId && (
                  <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                    {g.versions.map((v) => (
                      <div key={v._id} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>v{v.version} · {formatBytes(v.size)} · {formatDateTime(v.createdAt)}</span>
                        <a href={`/api/sprintos/documents/${v._id}`} className="text-primary hover:underline">Download</a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </CardContent>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{replacing ? `New version of “${replacing.title}”` : "Upload Document"}</SheetTitle>
            <SheetDescription>PDF, Office, images, archives — up to 25 MB.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="space-y-1.5">
              <Label>File *</Label>
              <Input type="file" onChange={(e) => { setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null })); setFileError(null); }} />
              {fileError && <p className="text-xs text-destructive">{fileError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Defaults to the file name" />
            </div>
            {!replacing && (
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v ?? "other" }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PMS_DOCUMENT_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
            <Button type="button" onClick={submit} disabled={uploading} className="w-full">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : replacing ? "Upload new version" : "Upload"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </GlassCard>
  );
}
