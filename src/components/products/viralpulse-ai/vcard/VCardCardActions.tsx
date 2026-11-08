"use client";

import React, { useState, useTransition } from "react";
import { Copy, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { deleteVCardAction, duplicateVCardAction } from "@/app/(products)/viralpulse-ai/(protected)/vcards/actions";
import type { VCardListItem } from "@/lib/products/viralpulse-ai/vcard/types";

interface VCardCardActionsProps {
  card: VCardListItem;
}

export default function VCardCardActions({ card }: VCardCardActionsProps) {
  const router = useRouter();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDuplicating, startDuplicate] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  const handleDuplicate = () => {
    startDuplicate(async () => {
      try {
        const res = await duplicateVCardAction(card.id);
        if (res.ok && res.id) {
          toast.success("Card duplicated!");
          router.push(`/viralpulse-ai/vcards/${res.id}`);
        } else {
          toast.error((res as { error?: string }).error || "Duplicate failed.");
        }
      } catch {
        toast.error("Failed to duplicate card.");
      }
    });
  };

  const handleDelete = () => {
    startDelete(async () => {
      try {
        const res = await deleteVCardAction(card.id);
        if (res.ok) {
          toast.success("Card deleted.");
          router.refresh();
        } else {
          toast.error((res as { error?: string }).error || "Delete failed.");
        }
      } catch {
        toast.error("Failed to delete card.");
      } finally {
        setShowDeleteModal(false);
      }
    });
  };

  return (
    <>
      <a
        href={`/api/viralpulse-ai/vcard/${card.id}/pdf`}
        download={`${card.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_VisitingCard.pdf`}
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors inline-flex items-center justify-center"
        title="Download PDF Card"
      >
        <FileText className="size-3.5" />
      </a>
      <Button variant="ghost" size="icon-sm" onClick={handleDuplicate} disabled={isDuplicating} title="Duplicate card">
        <Copy className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => setShowDeleteModal(true)} title="Delete card"
        className="text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600">
        <Trash2 className="size-3.5" />
      </Button>

      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Visiting Card?</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <span className="font-semibold text-foreground">"{card.name}"</span>'s visiting card? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete Card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
