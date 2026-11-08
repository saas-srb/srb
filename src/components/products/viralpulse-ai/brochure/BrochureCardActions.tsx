"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Globe, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { deleteBrochureAction } from "@/app/(products)/viralpulse-ai/(protected)/brochures/actions";

interface BrochureCardActionsProps {
  id: string;
  title: string;
  slug?: string;
  status: "draft" | "published";
}

export default function BrochureCardActions({ id, title, slug, status }: BrochureCardActionsProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, startDeleting] = useTransition();

  const handleDelete = () => {
    startDeleting(async () => {
      try {
        const res = await deleteBrochureAction(id);
        if (!res.ok) {
          toast.error(res.error || "Failed to delete brochure.");
          return;
        }

        toast.success("Brochure deleted successfully.");
        setShowConfirm(false);
        router.refresh();
      } catch (err: unknown) {
        toast.error((err as Error)?.message || "Something went wrong.");
      }
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={`/viralpulse-ai/brochures/${id}`}
          className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] font-medium hover:bg-primary/5 hover:text-primary transition-colors"
        >
          <FileText className="size-3" /> Edit
        </Link>

        {status === "published" && slug && (
          <Link
            href={`/brochure/${slug}`}
            target="_blank"
            className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] font-medium hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
          >
            <Globe className="size-3" /> View live
          </Link>
        )}

        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-colors ml-auto"
          title="Delete brochure"
        >
          <Trash2 className="size-3" /> Delete
        </button>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Delete Brochure?</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Are you sure you want to delete <span className="font-semibold text-foreground">“{title}”</span>?
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="py-2 text-xs text-muted-foreground">
            This action cannot be undone. The brochure and its public link will be permanently removed. Any collected leads will remain archived.
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="gap-1.5"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5" />
                  Yes, Delete Brochure
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
