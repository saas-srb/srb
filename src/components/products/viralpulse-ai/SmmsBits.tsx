import type { ReactNode } from "react";
import { Film, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORM_META, STATUS_META, type ContentStatus, type Platform } from "@/lib/products/viralpulse-ai/constants";

/** Small presentational pieces shared by server and client SMMS components (no server imports). */

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const m = STATUS_META[status as ContentStatus] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", m.cls, className)}>{m.label}</span>;
}

export function PlatformChip({ platform, full = false, className }: { platform: string; full?: boolean; className?: string }) {
  const m = PLATFORM_META[platform as Platform];
  if (!m) return <span className="text-xs text-muted-foreground">{platform}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap", m.chip, className)} title={m.label}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      {full ? m.label : m.short}
    </span>
  );
}

export function KindChip({ kind }: { kind: "image" | "video" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      {kind === "video" ? <Film className="size-3" /> : <ImageIcon className="size-3" />}
      {kind === "video" ? "Video" : "Image"}
    </span>
  );
}

export const mediaSrc = (id: string, bust?: string) => `/api/viralpulse-ai/media/${id}${bust ? `?v=${encodeURIComponent(bust)}` : ""}`;

/** Thumbnail for a library item: the image itself, a video's thumbnail image, or a placeholder. */
export function MediaThumb({ media, className }: { media: { _id: string; kind: "image" | "video"; name: string; thumbnailId: string | null; updatedAt?: string; altText?: string; hasThumb?: boolean }; className?: string }) {
  const src = media.kind === "image" ? mediaSrc(media._id, media.updatedAt) + (media.hasThumb ? (mediaSrc(media._id, media.updatedAt).includes("?") ? "&" : "?") + "thumb=1" : "") : media.thumbnailId ? mediaSrc(media.thumbnailId) : null;
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden rounded-lg bg-muted", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated private media route, not optimizable
        <img src={src} alt={media.altText || media.name} className="size-full object-cover" loading="lazy" />
      ) : (
        <Film className="size-6 text-muted-foreground" />
      )}
      {media.kind === "video" && (
        <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">
          <Film className="inline size-3" /> Video
        </span>
      )}
    </div>
  );
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function Field({ label, hint, children, className, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function CharCount({ value, limit }: { value: string; limit: number | null }) {
  if (!limit) return null;
  const over = value.length > limit;
  return <span className={cn("text-[11px] tabular-nums", over ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted-foreground")}>{`${value.length}/${limit}`}</span>;
}

/** One labelled single-hue meter row (value as text + proportional bar) — identity is never colour-only. */
export function MeterRow({ label, value, max, hint }: { label: ReactNode; value: number; max: number; hint?: ReactNode }) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="space-y-1" title={`${value}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-foreground">
          {value.toLocaleString("en-IN")}
          {hint && <span className="ml-1 font-normal text-muted-foreground">{hint}</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary/80" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
