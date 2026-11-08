"use client";

import { useState } from "react";
import { Film, ImageIcon, ThumbsUp, MessageCircle, Share2 } from "lucide-react";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import { mediaSrc } from "@/components/products/viralpulse-ai/SmmsBits";
import { cn } from "@/lib/utils";

export interface PreviewMedia {
  id: string;
  kind: "image" | "video";
  name: string;
}

/**
 * An approximation of how the ad reads, built only from what the person entered: the Page and Instagram names are the connected accounts',
 * the text and media are the ad's. No likes, comments or reach are shown. Meta's own preview can differ (cropping, truncation).
 */
export default function AdPreview({ pageName, igHandle, primaryText, headline, description, cta, displayLink, media, politicalLabel }: { pageName: string | null; igHandle: string | null; primaryText: string; headline: string; description: string; cta: string | null; displayLink: string; media: PreviewMedia | null; politicalLabel?: boolean }) {
  const [mode, setMode] = useState<"feed" | "ig" | "story">("feed");
  const name = mode === "ig" ? (igHandle ? `@${igHandle.replace(/^@/, "")}` : (pageName ?? "Your Instagram account")) : (pageName ?? "Your Page");
  const text = primaryText.trim();
  const clipped = text.length > 125 ? `${text.slice(0, 125).trimEnd()}… See more` : text;
  const mediaEl = !media ? (
    <div className="flex aspect-square items-center justify-center bg-muted text-muted-foreground"><ImageIcon className="size-8" aria-label="No media yet" /></div>
  ) : media.kind === "image" ? (
    // eslint-disable-next-line @next/next/no-img-element -- private authenticated media route
    <img src={mediaSrc(media.id)} alt={media.name} className={cn("w-full bg-muted object-cover", mode === "story" ? "aspect-[9/16]" : "max-h-96")} />
  ) : (
    <div className={cn("relative flex items-center justify-center bg-muted", mode === "story" ? "aspect-[9/16]" : "aspect-video")}>
      <video src={mediaSrc(media.id)} className="size-full object-cover" preload="metadata" muted playsInline aria-label={media.name} />
      <Film className="pointer-events-none absolute size-8 text-white/80 drop-shadow" aria-hidden />
    </div>
  );
  return (
    <div className="space-y-2">
      <PanelTabs label="Preview placement" active={mode} onSelect={(k) => setMode(k as typeof mode)} tabs={[{ key: "feed", label: "Facebook Feed" }, { key: "ig", label: "Instagram Feed" }, { key: "story", label: "Stories and Reels" }]} />
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-border/60 bg-background text-xs shadow-sm">
        {mode === "story" ? (
          <div className="relative">
            {mediaEl}
            <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-3 text-white">
              <span className="size-7 rounded-full bg-white/30" aria-hidden />
              <span className="font-semibold">{pageName ?? "Your Page"}</span>
              <span className="ml-auto text-[10px] opacity-80">Sponsored</span>
            </div>
            <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
              {headline && <p className="text-sm font-semibold">{headline}</p>}
              {cta && <p className="mx-auto w-fit rounded-full bg-white px-4 py-1 font-semibold text-black">{cta}</p>}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 p-3">
              <span className="size-8 shrink-0 rounded-full bg-muted" aria-hidden />
              <div className="min-w-0">
                <p className="truncate font-semibold">{name}</p>
                <p className="text-[10px] text-muted-foreground">Sponsored{politicalLabel ? " · Paid for by the advertiser" : ""}</p>
              </div>
            </div>
            {clipped && <p className="whitespace-pre-wrap px-3 pb-2">{clipped}</p>}
            {mediaEl}
            <div className="flex items-center justify-between gap-2 bg-muted/40 p-3">
              <div className="min-w-0">
                {displayLink && <p className="truncate text-[10px] uppercase text-muted-foreground">{displayLink}</p>}
                {headline && <p className="truncate font-semibold">{headline}</p>}
                {description && <p className="truncate text-muted-foreground">{description}</p>}
              </div>
              {cta && <span className="shrink-0 rounded-md bg-muted px-3 py-1.5 font-semibold">{cta}</span>}
            </div>
            <div className="flex items-center justify-around border-t border-border/50 py-2 text-muted-foreground" aria-hidden>
              <span className="flex items-center gap-1"><ThumbsUp className="size-3.5" /> Like</span>
              <span className="flex items-center gap-1"><MessageCircle className="size-3.5" /> Comment</span>
              <span className="flex items-center gap-1"><Share2 className="size-3.5" /> Share</span>
            </div>
          </>
        )}
      </div>
      <p className="text-center text-[11px] text-muted-foreground">An approximation from your text and media. Meta&apos;s own preview can crop or shorten differently.</p>
    </div>
  );
}
