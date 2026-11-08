import { Globe, Heart, MessageCircle, Send, ThumbsUp, Repeat2, Play, MoreHorizontal, Bookmark } from "lucide-react";
import { MediaThumb, PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import { hashtagText } from "@/lib/products/viralpulse-ai/content";
import { PLATFORM_META, type Platform } from "@/lib/products/viralpulse-ai/constants";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";
import { cn } from "@/lib/utils";

/**
 * An approximate, platform-styled preview for review before scheduling —
 * layout, truncation and CTA placement, not a pixel-exact render.
 */
export default function PlatformPreview({
  platform,
  brand,
  title,
  body,
  hashtags,
  cta,
  link,
  media,
  aspect,
  sponsored = false,
  description,
}: {
  platform: Platform;
  brand: string;
  title?: string;
  body: string;
  hashtags: string[];
  cta?: string;
  link?: string | null;
  media: MediaCard | null;
  aspect?: { width: number; height: number } | null;
  sponsored?: boolean;
  description?: string;
}) {
  const meta = PLATFORM_META[platform];
  const tags = platform === "google_business" || platform === "google_ads" ? "" : hashtagText(hashtags);
  const text = [body, tags && !hashtags.every((h) => body.includes(h)) ? tags : ""].filter(Boolean).join("\n\n");
  const ratio = aspect ? `${aspect.width} / ${aspect.height}` : platform === "youtube" ? "16 / 9" : platform === "instagram" ? "4 / 5" : "1.91 / 1";
  const initials = brand.slice(0, 2).toUpperCase();
  const domain = link ? link.replace(/^https?:\/\//, "").split("/")[0] : null;

  const mediaBox = (
    <div className="relative w-full overflow-hidden bg-muted" style={{ aspectRatio: ratio }}>
      {media ? <MediaThumb media={media} className="absolute inset-0 size-full rounded-none" /> : <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">No media attached</div>}
      {media?.kind === "video" && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-black/55 text-white"><Play className="size-5" /></span>
        </span>
      )}
    </div>
  );

  if (platform === "google_ads") {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-3 text-sm shadow-sm">
        <p className="text-[11px] font-semibold">Sponsored</p>
        <p className="text-[11px] text-muted-foreground">{domain ?? "yourdomain.com"}</p>
        <p className="mt-0.5 text-base leading-snug text-blue-700 dark:text-blue-400">{title || "Headline"}</p>
        <p className="line-clamp-3 text-xs text-muted-foreground">{description || body}</p>
        {media && <div className="mt-2 w-40">{mediaBox}</div>}
      </div>
    );
  }

  if (platform === "youtube") {
    return (
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card text-sm shadow-sm">
        {mediaBox}
        <div className="flex gap-2 p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">{initials}</span>
          <div className="min-w-0">
            <p className="line-clamp-2 font-semibold leading-snug">{title || "Video title"}</p>
            <p className="text-[11px] text-muted-foreground">{brand}{sponsored ? " · Ad" : ""}</p>
            <p className="mt-1 line-clamp-3 text-xs whitespace-pre-wrap text-muted-foreground">{text}</p>
          </div>
        </div>
      </div>
    );
  }

  const showCta = Boolean(cta && (sponsored || platform === "google_business" || link));
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card text-sm shadow-sm">
      <div className="flex items-center gap-2 p-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: meta.color }}>{initials}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-semibold">{brand}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">{sponsored ? "Sponsored" : platform === "x" ? `@${brand.toLowerCase().replace(/\s+/g, "")} · now` : "Just now"}{platform === "x" ? null : <> · <Globe className="size-3" /></>}</p>
        </div>
        <MoreHorizontal className="size-4 text-muted-foreground" />
      </div>
      {platform !== "instagram" && (text || title) && (
        <div className="px-3 pb-2">
          {title && platform !== "facebook" && <p className="font-semibold">{title}</p>}
          <p className="line-clamp-6 text-[13px] whitespace-pre-wrap">{text}</p>
        </div>
      )}
      {mediaBox}
      {(showCta || (sponsored && title)) && (
        <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-muted/40 px-3 py-2">
          <div className="min-w-0">
            {domain && <p className="truncate text-[10px] text-muted-foreground uppercase">{domain}</p>}
            {title && <p className="truncate text-[13px] font-semibold">{title}</p>}
          </div>
          {cta && <span className={cn("shrink-0 rounded-md px-3 py-1 text-xs font-semibold", platform === "google_business" ? "bg-blue-600 text-white" : "bg-muted text-foreground")}>{cta}</span>}
        </div>
      )}
      <div className="flex items-center gap-4 px-3 py-2 text-muted-foreground">
        {platform === "instagram" ? (
          <>
            <Heart className="size-4" /><MessageCircle className="size-4" /><Send className="size-4" /><Bookmark className="ml-auto size-4" />
          </>
        ) : platform === "x" ? (
          <>
            <MessageCircle className="size-4" /><Repeat2 className="size-4" /><Heart className="size-4" /><Send className="ml-auto size-4" />
          </>
        ) : (
          <>
            <ThumbsUp className="size-4" /><MessageCircle className="size-4" /><Repeat2 className="size-4" /><Send className="size-4" />
          </>
        )}
      </div>
      {platform === "instagram" && (
        <p className="line-clamp-4 px-3 pb-3 text-[13px] whitespace-pre-wrap">
          <span className="font-semibold">{brand.toLowerCase().replace(/\s+/g, "")}</span> {text}
        </p>
      )}
      <div className="px-3 pb-2"><PlatformChip platform={platform} full /></div>
    </div>
  );
}
