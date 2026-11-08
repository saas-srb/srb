"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { toast } from "sonner";
import { registerMediaAction, replaceMediaAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import { newUploadPathAction } from "@/app/(products)/viralpulse-ai/(protected)/image-studio/actions";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, VIDEO_TYPES } from "@/lib/products/viralpulse-ai/constants";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";

async function dimensions(file: File): Promise<{ width?: number; height?: number; durationSec?: number }> {
  try {
    if (file.type.startsWith("image/")) {
      const bmp = await createImageBitmap(file);
      const out = { width: bmp.width, height: bmp.height };
      bmp.close();
      return out;
    }
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight, durationSec: Math.round(v.duration) });
        v.onerror = () => resolve({});
        v.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return {};
  }
}

/**
 * Browser → Vercel Blob upload (the server only issues a scoped token), then
 * registration: the server re-reads the stored file's real type and size before
 * it joins the media library. `replaceId` swaps the file behind an existing item.
 */
export function useMediaUpload() {
  const [progress, setProgress] = useState<number | null>(null);

  async function uploadFile(file: File, opts: { replaceId?: string; accept?: "image" | "video" | "both"; meta?: Record<string, unknown> } = {}): Promise<MediaCard | true | null> {
    const ext = IMAGE_TYPES[file.type] ?? VIDEO_TYPES[file.type];
    const isVideo = Boolean(VIDEO_TYPES[file.type]);
    if (!ext) {
      toast.error("Only JPG, PNG, WebP, GIF, MP4, MOV and WebM files are supported.");
      return null;
    }
    if ((opts.accept === "image" && isVideo) || (opts.accept === "video" && !isVideo)) {
      toast.error(`Choose ${opts.accept === "image" ? "an image" : "a video"}.`);
      return null;
    }
    if (file.size > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
      toast.error(`That file is too large (max ${isVideo ? MAX_VIDEO_BYTES / 1048576 : MAX_IMAGE_BYTES / 1048576} MB).`);
      return null;
    }
    setProgress(0);
    try {
      const made = await newUploadPathAction(ext);
      if (!made.ok) {
        toast.error(made.error);
        return null;
      }
      const pathname = made.path;
      await upload(pathname, file, {
        access: "private",
        handleUploadUrl: "/api/viralpulse-ai/media/upload",
        contentType: file.type,
        multipart: file.size > 20 * 1024 * 1024,
        onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
      });
      const meta = { name: file.name.replace(/\.[^.]+$/, ""), ...(await dimensions(file)), ...(opts.meta ?? {}) };
      if (opts.replaceId) {
        const res = await replaceMediaAction(opts.replaceId, pathname, meta);
        if (!res.ok) {
          toast.error(res.error);
          return null;
        }
        toast.success("File replaced.");
        return true;
      }
      const res = await registerMediaAction(pathname, meta);
      if (!res.ok) {
        toast.error(res.error);
        return null;
      }
      toast.success(`Uploaded ${file.name}`);
      return res.media;
    } catch (err) {
      toast.error((err as Error)?.message?.slice(0, 160) || "Upload failed.");
      return null;
    } finally {
      setProgress(null);
    }
  }

  return { uploadFile, progress };
}
