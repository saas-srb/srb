"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { registerCmsMediaAction } from "@/app/(products)/sitecraft-ai/(protected)/media/actions";
import type { CmsMediaDoc } from "@/lib/products/sitecraft-ai/media";

const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" };
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Browser -> Vercel Blob upload (the server only issues a scoped token), then registration — mirrors `useMediaUpload.ts` (SMMS). */
export function useCmsMediaUpload() {
  const [progress, setProgress] = useState<number | null>(null);

  async function uploadFile(file: File): Promise<CmsMediaDoc | null> {
    const ext = IMAGE_EXT[file.type];
    if (!ext) {
      toast.error("Only JPG, PNG, WebP, GIF and SVG files are supported.");
      return null;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("That file is too large (max 20 MB).");
      return null;
    }
    setProgress(0);
    try {
      const pathname = `cms/uploads/${crypto.randomUUID()}.${ext}`;
      await upload(pathname, file, {
        access: "private",
        handleUploadUrl: "/api/sitecraft-ai/media/upload",
        contentType: file.type,
        onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
      });
      const res = await registerCmsMediaAction(pathname, file.name.replace(/\.[^.]+$/, ""));
      if (!res.ok) {
        toast.error(res.error);
        return null;
      }
      return res.media;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
      return null;
    } finally {
      setProgress(null);
    }
  }

  return { uploadFile, progress };
}
