"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2, Search, Upload, X, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { MediaThumb, formatBytes } from "@/components/products/viralpulse-ai/SmmsBits";
import { useMediaUpload } from "@/components/products/viralpulse-ai/useMediaUpload";
import { pickerMediaAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";
import { cn } from "@/lib/utils";

/** Pick library items (or upload new ones) to attach to an ad or a post. */
export default function MediaPicker({ kind, multiple, onPick, canUpload, trigger }: { kind: "image" | "video" | "both"; multiple: boolean; onPick: (items: MediaCard[]) => void; canUpload: boolean; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MediaCard[]>([]);
  const [chosen, setChosen] = useState<MediaCard[]>([]);
  const [loading, start] = useTransition();
  const { uploadFile, progress } = useMediaUpload();
  const fileRef = useRef<HTMLInputElement>(null);

  function load(query: string) {
    start(async () => {
      const res = await pickerMediaAction(query, kind === "both" ? "" : kind, 1);
      if (res.ok) setItems(res.items);
      else toast.error(res.error);
    });
  }

  useEffect(() => {
    if (open) load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the dialog opens
  }, [open]);

  function toggle(m: MediaCard) {
    setChosen((c) => (c.some((x) => x._id === m._id) ? c.filter((x) => x._id !== m._id) : multiple ? [...c, m] : [m]));
  }

  async function onFiles(files: FileList | null) {
    for (const f of Array.from(files ?? [])) {
      const m = await uploadFile(f, { accept: kind });
      if (m && m !== true) {
        setItems((xs) => [m, ...xs]);
        toggle(m);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents">{trigger}</span>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setChosen([]); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{`Choose ${kind === "both" ? "media" : kind === "image" ? "an image" : "a video"}`}</DialogTitle>
            <DialogDescription>From the central media library{canUpload ? ", or upload a new file" : ""}.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <form className="relative flex-1" onSubmit={(e) => { e.preventDefault(); load(q); }}>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, tag, caption" className="h-9 pl-8" />
            </form>
            {canUpload && (
              <>
                <input ref={fileRef} type="file" hidden multiple={multiple} accept={kind === "video" ? "video/mp4,video/quicktime,video/webm" : kind === "image" ? "image/jpeg,image/png,image/webp,image/gif" : "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"} onChange={(e) => onFiles(e.target.files)} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={progress !== null}>
                  {progress !== null ? <><Loader2 className="size-4 animate-spin" />{`${progress}%`}</> : <><Upload className="size-4" /> Upload</>}
                </Button>
              </>
            )}
          </div>
          {loading && items.length === 0 ? (
            <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No media found.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((m) => {
                const on = chosen.some((c) => c._id === m._id);
                return (
                  <button type="button" key={m._id} onClick={() => toggle(m)} className={cn("group relative rounded-xl border p-1 text-left transition", on ? "border-primary ring-2 ring-primary/40" : "border-border/50 hover:border-primary/40")}>
                    <MediaThumb media={m} className="aspect-square w-full" />
                    <p className="mt-1 truncate px-0.5 text-[11px] font-medium">{m.name}</p>
                    <p className="px-0.5 text-[10px] text-muted-foreground">{`${m.width && m.height ? `${m.width}×${m.height} · ` : ""}${formatBytes(m.size)}`}</p>
                    {on && <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3.5" /></span>}
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button type="button" disabled={chosen.length === 0} onClick={() => { onPick(chosen); setOpen(false); setChosen([]); }}>
              <ImagePlus className="size-4" /> {`Attach ${chosen.length || ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The attached-media strip used in the ad and post editors. */
export function AttachedMedia({ items, onRemove, disabled }: { items: MediaCard[]; onRemove: (id: string) => void; disabled?: boolean }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">Nothing attached yet.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((m) => (
        <div key={m._id} className="relative w-28">
          <a href={`/api/viralpulse-ai/media/${m._id}`} target="_blank" rel="noreferrer">
            <MediaThumb media={m} className="aspect-square w-28" />
          </a>
          <p className="truncate text-[10px] text-muted-foreground">{m.name}</p>
          {!disabled && (
            <button type="button" onClick={() => onRemove(m._id)} aria-label={`Detach ${m.name}`} className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
