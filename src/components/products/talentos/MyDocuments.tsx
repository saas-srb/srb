"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Eye, Trash2 } from "lucide-react";
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
import { EMPLOYEE_UPLOADABLE_CATEGORIES, documentCategoryLabel, isInlinePreviewable } from "@/lib/products/talentos/document-categories";
import { formatDate } from "@/lib/utils";
import { deleteMyDocumentAction } from "@/app/(products)/talentos/(protected)/me/documents/actions";

interface Doc {
  _id: string;
  category: string;
  title: string;
  filename: string;
  contentType: string;
  size: number;
  expiryDate: string | null;
  version: number;
  uploadedByRole: "staff" | "employee";
  createdAt: string;
}

export default function MyDocuments({ documents }: { documents: Doc[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteMyDocumentAction(id);
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
        <h2 className="text-sm font-semibold text-foreground">{documents.length} document{documents.length === 1 ? "" : "s"}</h2>
        <DocumentUploadSheet allowedCategories={EMPLOYEE_UPLOADABLE_CATEGORIES} />
      </div>

      <GlassCard interactive={false}>
        <CardContent className="space-y-2">
          {documents.length === 0 && <p className="text-sm text-muted-foreground">No documents yet.</p>}
          {documents.map((d) => (
            <div key={d._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3 text-sm">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{d.title}</span>
                  <Badge className="bg-secondary/60 text-secondary-foreground">{documentCategoryLabel(d.category)}</Badge>
                  {d.version > 1 && <span className="text-xs text-muted-foreground">v{d.version}</span>}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {d.filename} · added {formatDate(d.createdAt)}
                  {d.expiryDate ? ` · expires ${formatDate(d.expiryDate)}` : ""}
                </p>
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
                {d.uploadedByRole === "employee" && (
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
                        <AlertDialogDescription>You can only remove documents you uploaded yourself.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(d._id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </GlassCard>
    </div>
  );
}
