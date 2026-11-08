"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Upload, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelBody, PanelHeader, PanelTitle, PanelDescription } from "@/components/products/sitecraft-ai/ui/SidePanel";
import { listCmsMediaAction } from "@/app/(products)/sitecraft-ai/(protected)/media/actions";
import { useCmsMediaUpload } from "@/lib/useCmsMediaUpload";
import type { CmsMediaDoc } from "@/lib/products/sitecraft-ai/media";

/** A side product for picking (or uploading) an image, used from section editors' image fields. */
export default function MediaPicker({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (url: string) => void }) {
  const [items, setItems] = useState<CmsMediaDoc[] | null>(null);
  const { uploadFile, progress } = useCmsMediaUpload();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) listCmsMediaAction().then(setItems);
  }, [open]);

  const handleUpload = async (file: File) => {
    const media = await uploadFile(file);
    if (media) {
      setItems((prev) => [media, ...(prev ?? [])]);
      onSelect(`/api/sitecraft-ai/media/${media._id}`);
      onClose();
    }
  };

  return (
    <Panel open={open} onOpenChange={(o) => !o && onClose()}>
      <PanelContent size="xl">
        <PanelHeader>
          <PanelTitle>Media Library</PanelTitle>
          <PanelDescription>Pick an existing image, or upload a new one.</PanelDescription>
        </PanelHeader>
        <PanelBody className="space-y-3">
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={progress !== null}>
            {progress !== null ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {progress !== null ? `Uploading… ${progress}%` : "Upload image"}
          </Button>
          <div className="grid grid-cols-3 gap-3">
            {items === null && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
            {items?.map((m) => (
              <button
                key={m._id}
                type="button"
                onClick={() => {
                  onSelect(`/api/sitecraft-ai/media/${m._id}`);
                  onClose();
                }}
                className="group relative aspect-square overflow-hidden rounded-lg border border-border/60 hover:border-primary"
              >
                <Image src={`/api/sitecraft-ai/media/${m._id}`} alt={m.altText || m.name} fill unoptimized className="object-cover" />
                <span className="absolute inset-0 hidden items-center justify-center bg-black/40 group-hover:flex">
                  <Check className="size-5 text-white" />
                </span>
              </button>
            ))}
            {items?.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No media uploaded yet.</p>}
          </div>
        </PanelBody>
      </PanelContent>
    </Panel>
  );
}
