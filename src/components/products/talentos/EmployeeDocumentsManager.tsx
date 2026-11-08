"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Eye, Trash2, History } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import DocumentUploadSheet from "@/components/products/talentos/DocumentUploadSheet";
import { DOCUMENT_CATEGORIES, documentCategoryLabel, isInlinePreviewable } from "@/lib/products/talentos/document-categories";
import { formatDate } from "@/lib/utils";
import { deleteDocumentAction } from "@/app/(products)/talentos/(protected)/(staff)/employees/[id]/document-actions";

interface Doc {
  _id: string;
  category: string;
  title: string;
  filename: string;
  contentType: string;
  size: number;
  issuedDate: string | null;
  expiryDate: string | null;
  version: number;
  uploadedByRole: "staff" | "employee";
  createdAt: string;
}

const ALL_CATEGORIES = DOCUMENT_CATEGORIES.map((c) => c.value);

function expiryBadge(expiryDate: string | null) {
  if (!expiryDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  if (expiryDate < today) return <Badge className="bg-destructive/15 text-destructive">Expired {formatDate(expiryDate)}</Badge>;
  if (expiryDate <= soon) return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">Expires {formatDate(expiryDate)}</Badge>;
  return <span className="text-xs text-muted-foreground">Expires {formatDate(expiryDate)}</span>;
}

export default function EmployeeDocumentsManager({ employeeId, documents }: { employeeId: string; documents: Doc[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteDocumentAction(id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete.");
        return;
      }
      toast.success("Document removed");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{documents.length} document{documents.length === 1 ? "" : "s"}</h3>
        <DocumentUploadSheet employeeId={employeeId} allowedCategories={ALL_CATEGORIES} />
      </div>

      <GlassCard interactive={false}>
        <CardContent className="space-y-2">
          {documents.length === 0 && <p className="text-sm text-muted-foreground">No documents on file.</p>}
          {documents.map((d) => (
            <div key={d._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{d.title}</span>
                  <Badge className="bg-secondary/60 text-secondary-foreground">{documentCategoryLabel(d.category)}</Badge>
                  {d.version > 1 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <History className="size-3" /> v{d.version}
                    </span>
                  )}
                  {d.uploadedByRole === "employee" && <span className="text-xs text-muted-foreground">· employee-uploaded</span>}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {d.filename} · {(d.size / 1024).toFixed(0)} KB · added {formatDate(d.createdAt)}
                  {d.issuedDate ? ` · issued ${formatDate(d.issuedDate)}` : ""}
                </p>
                <div className="mt-1">{expiryBadge(d.expiryDate)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {isInlinePreviewable(d.contentType) && (
                  <a href={`/api/talentos/documents/${d._id}?inline=1`} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Preview">
                    <Eye className="size-4" />
                  </a>
                )}
                <a href={`/api/talentos/documents/${d._id}`} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Download">
                  <Download className="size-4" />
                </a>
                <DocumentUploadSheet
                  employeeId={employeeId}
                  allowedCategories={ALL_CATEGORIES}
                  replace={{ id: d._id, title: d.title, category: d.category }}
                  triggerVariant="outline"
                  triggerLabel="Replace"
                />
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button type="button" variant="ghost" size="icon-sm" disabled={pending} aria-label="Delete">
                        <Trash2 className="size-3.5" />
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete “{d.title}”?</AlertDialogTitle>
                      <AlertDialogDescription>The file is removed from disk; the record is kept for audit history.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(d._id)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </CardContent>
      </GlassCard>
    </div>
  );
}
