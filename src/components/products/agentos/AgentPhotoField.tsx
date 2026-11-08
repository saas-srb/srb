"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Check, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import BotAvatar from "@/components/products/agentos/BotAvatar";
import { AVATAR_ACCEPT, AVATAR_MAX_BYTES, checkAvatarBytes } from "@/lib/products/agentos/avatar-shared";

/** What the form holds about the photo until Save: a cropped square image to upload, or a request to remove the current one. */
export interface PhotoDraft {
  blob: Blob | null;
  previewUrl: string | null;
  remove: boolean;
}
export const EMPTY_PHOTO: PhotoDraft = { blob: null, previewUrl: null, remove: false };

const OUT = 512; // exported square, px
const VIEW = 220; // on-screen crop square, px

/** Photo picker with a square crop (zoom + position) so every surface can show it as a circle/rounded square without distortion. */
export default function AgentPhotoField({
  icon,
  color,
  savedUrl,
  draft,
  onChange,
  disabled,
}: {
  icon: string;
  color: string;
  savedUrl: string | null;
  draft: PhotoDraft;
  onChange: (next: PhotoDraft) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<{ url: string; img: HTMLImageElement } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fx, setFx] = useState(0.5); // 0..1 position of the crop window along the free axis
  const [fy, setFy] = useState(0.5);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => () => void (src && URL.revokeObjectURL(src.url)), [src]);

  // The crop window in source pixels for the current zoom/position.
  const windowFor = (img: HTMLImageElement) => {
    const side = Math.min(img.naturalWidth, img.naturalHeight) / zoom;
    return { side, sx: (img.naturalWidth - side) * fx, sy: (img.naturalHeight - side) * fy };
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !src) return;
    const { side, sx, sy } = windowFor(src.img);
    const ctx = c.getContext("2d");
    ctx?.clearRect(0, 0, VIEW, VIEW);
    ctx?.drawImage(src.img, sx, sy, side, side, 0, 0, VIEW, VIEW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, zoom, fx, fy]);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > AVATAR_MAX_BYTES) return void toast.error("Use an image under 2 MB.");
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    // Cheap early check; the server validates the real bytes again.
    const check = checkAvatarBytes(head);
    if (!check.ok) return void toast.error(check.error);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setZoom(1);
      setFx(0.5);
      setFy(0.5);
      setSrc({ url, img });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("That image couldn't be read.");
    };
    img.src = url;
  }

  function confirmCrop() {
    if (!src) return;
    const { side, sx, sy } = windowFor(src.img);
    const out = document.createElement("canvas");
    out.width = out.height = OUT;
    out.getContext("2d")!.drawImage(src.img, sx, sy, side, side, 0, 0, OUT, OUT);
    const finish = (blob: Blob | null) => {
      if (!blob || blob.size > AVATAR_MAX_BYTES) return void toast.error("The cropped photo is too large. Try a smaller image.");
      if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      onChange({ blob, previewUrl: URL.createObjectURL(blob), remove: false });
      setSrc(null);
    };
    out.toBlob((b) => (b && b.type === "image/webp" ? finish(b) : out.toBlob(finish, "image/png")), "image/webp", 0.9);
  }

  const shownUrl = draft.remove ? null : (draft.previewUrl ?? savedUrl);
  const hasPhoto = Boolean(shownUrl);

  return (
    <div className="flex flex-col items-center gap-2">
      <BotAvatar icon={icon} color={color} imageUrl={shownUrl} size="lg" className="size-20 rounded-2xl" />
      <input ref={inputRef} type="file" accept={AVATAR_ACCEPT} className="sr-only" aria-label="Choose agent photo" tabIndex={-1} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="flex gap-1.5">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <Camera className="size-3.5" /> {hasPhoto ? "Replace" : "Add photo"}
        </Button>
        {hasPhoto && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            aria-label="Remove photo"
            onClick={() => {
              if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
              onChange({ blob: null, previewUrl: null, remove: Boolean(savedUrl) });
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      <span className="text-[11px] text-muted-foreground">{draft.blob ? "New photo, saved with the agent" : draft.remove ? "Photo removed on save" : hasPhoto ? "Photo" : "Icon preview"} · PNG, JPG or WebP, 2 MB max</span>

      {src && (
        <div role="dialog" aria-label="Crop photo" className="w-full max-w-64 space-y-3 rounded-2xl border border-border/60 bg-card/80 p-3">
          <canvas ref={canvasRef} width={VIEW} height={VIEW} className="mx-auto block size-[220px] rounded-xl border border-border/50" />
          <label className="block text-[11px] text-muted-foreground">
            Zoom
            <input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
          </label>
          {([["Left / right", fx, setFx, src.img.naturalWidth], ["Up / down", fy, setFy, src.img.naturalHeight]] as const).map(([label, value, setter, dim]) => {
            const room = dim - Math.min(src.img.naturalWidth, src.img.naturalHeight) / zoom > 1;
            return (
              <label key={label} className="block text-[11px] text-muted-foreground">
                {label}
                <input type="range" min={0} max={1} step={0.01} value={value} disabled={!room} onChange={(e) => setter(Number(e.target.value))} className="w-full accent-[var(--primary)] disabled:opacity-40" />
              </label>
            );
          })}
          <div className="flex justify-end gap-1.5">
            <Button type="button" size="sm" variant="ghost" onClick={() => setSrc(null)}><X className="size-3.5" /> Cancel</Button>
            <Button type="button" size="sm" onClick={confirmCrop}><Check className="size-3.5" /> Use photo</Button>
          </div>
        </div>
      )}
    </div>
  );
}
