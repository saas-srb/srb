"use client";

import { useCallback, useState } from "react";
import { Check, Film, ImageIcon, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import { MediaThumb, formatBytes } from "@/components/products/viralpulse-ai/SmmsBits";
import EmptyState from "@/components/products/viralpulse-ai/shared/EmptyState";
import ErrorState from "@/components/products/viralpulse-ai/shared/ErrorState";
import { listAiAssetsAction } from "@/app/(products)/viralpulse-ai/(protected)/asset-actions";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";
import { cn } from "@/lib/utils";

/**
 * Choose among what the studios have made: generated images (AI Image Studio) and UGC videos (AI UGC Studio). Reads real
 * library rows only; with nothing generated yet it says so. Later work packages use it for "Use in post / ad / campaign".
 */
export default function AssetPicker({ trigger, onPick, kinds = ["image", "video"], multiple = false, title = "Choose a generated asset" }: { trigger: React.ReactNode; onPick: (items: MediaCard[]) => void; kinds?: ("image" | "video")[]; multiple?: boolean; title?: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"image" | "video">(kinds[0] ?? "image");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MediaCard[]>([]);
  const [chosen, setChosen] = useState<MediaCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (k: "image" | "video", query: string) => {
    setLoading(true);
    setError(null);
    const res = await listAiAssetsAction({ kind: k, q: query, page: 1 });
    setLoading(false);
    if (res.ok) setItems(res.items);
    else setError(res.error);
  }, []);

  const toggle = (m: MediaCard) => setChosen((c) => (c.some((x) => x._id === m._id) ? c.filter((x) => x._id !== m._id) : multiple ? [...c, m] : [m]));

  return (
    <>
      <span onClick={() => { setOpen(true); void load(kind, q); }} className="contents">{trigger}</span>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setChosen([]); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Images from the AI Image Studio and videos from the AI UGC Studio.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            {kinds.length > 1 && (
              <PanelTabs label="Asset type" active={kind} onSelect={(k) => { setKind(k as "image" | "video"); setChosen([]); void load(k as "image" | "video", q); }} tabs={[{ key: "image", label: "Images", icon: <ImageIcon className="size-4" /> }, { key: "video", label: "UGC videos", icon: <Film className="size-4" /> }].filter((t) => kinds.includes(t.key as "image" | "video"))} />
            )}
            <form className="relative min-w-40 flex-1" onSubmit={(e) => { e.preventDefault(); void load(kind, q); }}>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, tag, caption" aria-label="Search assets" className="h-9 pl-8" />
            </form>
          </div>
          {loading && items.length === 0 ? (
            <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" aria-label="Loading" />
          ) : error ? (
            <ErrorState title="Couldn't load assets" onRetry={() => void load(kind, q)}>{error}</ErrorState>
          ) : items.length === 0 ? (
            <EmptyState icon={kind === "video" ? <Film className="size-5" /> : <ImageIcon className="size-5" />} title={q ? "Nothing matches that search" : kind === "video" ? "No UGC videos yet" : "No generated images yet"}>{q ? "Try a different word." : kind === "video" ? "Videos made in the AI UGC Studio appear here once they are ready." : "Images made in the AI Image Studio appear here."}</EmptyState>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((m) => {
                const on = chosen.some((c) => c._id === m._id);
                return (
                  <button type="button" key={m._id} aria-pressed={on} onClick={() => toggle(m)} className={cn("relative rounded-xl border p-1 text-left transition", on ? "border-primary ring-2 ring-primary/40" : "border-border/50 hover:border-primary/40")}>
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
            <Button type="button" disabled={chosen.length === 0} onClick={() => { onPick(chosen); setOpen(false); setChosen([]); }}>{`Use ${chosen.length || ""}`.trim()}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
