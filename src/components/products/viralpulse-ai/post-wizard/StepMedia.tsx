"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, GripVertical, ImageIcon, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import AssetPicker from "@/components/products/viralpulse-ai/shared/AssetPicker";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import MediaPicker from "@/components/products/viralpulse-ai/MediaPicker";
import { MediaThumb, PlatformChip, formatBytes } from "@/components/products/viralpulse-ai/SmmsBits";
import { setAltTextAction } from "@/app/(products)/viralpulse-ai/(protected)/posts/wizard-actions";
import { PLATFORM_META } from "@/lib/products/viralpulse-ai/constants";
import { ALT_TEXT_PLATFORMS, contentTypeDef, disclosureSummary, nativeLabelMap, type WizardState } from "@/lib/products/viralpulse-ai/post-wizard/helpers";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";
import { Callout, FieldError, sectionTitle, type StepProps } from "./shared";
import { usePlan } from "./usePlan";
import { cn } from "@/lib/utils";

const MEDIA_CODES = /aspect|duration|file_too_large|type_unsupported|too_many|mixed_media|video_unsupported|image_unsupported|dimensions|story|reel|cover|thumbnail|gif|alt/i;

export default function StepMedia(p: StepProps) {
  const { init, s, dispatch, errors, showErrors, locked, cards, setCards, ensureSaved } = p;
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const [drag, setDrag] = useState<number | null>(null);
  const [alts, setAlts] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const items = s.mediaIds.map((id) => cards[id]).filter((c): c is MediaCard => Boolean(c));
  const hasVideo = items.some((m) => m.kind === "video");
  const wantsVideo = s.platforms.some((pl) => ["video", "reel", "short"].includes(s.contentTypes[pl] ?? ""));
  const kinds: ("image" | "video")[] = wantsVideo || hasVideo ? ["image", "video"] : ["image"];
  const checkKey = JSON.stringify([s.platforms, s.contentTypes, s.mediaIds, s.thumbnailId]);
  const { plan, loading, error, refresh } = usePlan(s.platforms.length > 0, checkKey, ensureSaved);
  const ai_ = items.filter((m) => m.aiDisclosed);
  const disc = disclosureSummary({ any: ai_.length > 0, video: ai_.some((m) => m.kind === "video") }, s.platforms, init.settings.aiDisclosureOff, nativeLabelMap(s.platforms, s.contentTypes, init.caps));
  const thumbWanted = (s.platforms.includes("youtube")) || (s.platforms.includes("instagram") && s.contentTypes.instagram === "reel");
  const altWanted = s.platforms.some((pl) => ALT_TEXT_PLATFORMS.includes(pl));
  const max = Math.max(1, ...s.platforms.map((pl) => contentTypeDef(pl, s.contentTypes[pl])?.max ?? 1));

  const add = (picked: MediaCard[]) => {
    setCards(picked);
    const ids = [...new Set([...s.mediaIds, ...picked.map((m) => m._id)])].slice(0, 20);
    dispatch({ type: "set", patch: { mediaIds: ids, handoff: s.handoff ?? "library" } });
  };
  const remove = (id: string) => dispatch({ type: "set", patch: { mediaIds: s.mediaIds.filter((x) => x !== id), thumbnailId: s.thumbnailId === id ? null : s.thumbnailId } });
  const move = (from: number, to: number) => dispatch({ type: "moveMedia", from, to });

  function saveAlt(m: MediaCard) {
    const text = alts[m._id];
    if (text === undefined || text === m.altText) return;
    start(async () => {
      const res = await setAltTextAction(m._id, text);
      if (!res.ok) return void toast.error(res.error);
      setCards([{ ...m, altText: text }]);
      toast.success("Alt text saved to the library.");
    });
  }

  const issues = plan?.platforms.flatMap((pp) => pp.issues.filter((i) => MEDIA_CODES.test(i.code) || i.mediaId).map((i) => ({ ...i, platform: pp.platform, label: pp.label }))) ?? [];

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="media-files">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="media-files" className={sectionTitle}>{`Pictures and videos${max > 1 ? ` (up to ${max})` : ""}`}</h3>
          {!locked && (
            <div className="flex flex-wrap gap-2">
              <AssetPicker kinds={kinds} multiple onPick={add} title="Choose from your generated pictures and videos" trigger={<Button type="button" size="sm"><Sparkles className="size-3.5" /> Generated assets</Button>} />
              <MediaPicker kind={kinds.length === 2 ? "both" : "image"} multiple onPick={add} canUpload={init.can.upload} trigger={<Button type="button" size="sm" variant="outline"><ImageIcon className="size-3.5" /> Library &amp; upload</Button>} />
            </div>
          )}
        </div>
        {s.handoff && s.handoff !== "library" && items.length > 0 && <Callout tone="info">{`These files came from the ${s.handoff === "ugc_studio" ? "AI UGC Studio" : "AI Image Studio"}. AI-generated files are labelled automatically below.`}</Callout>}
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 px-6 py-10 text-center text-xs text-muted-foreground">
            No media yet. {s.platforms.every((pl) => contentTypeDef(pl, s.contentTypes[pl])?.media === "none") ? "The post types you chose do not need any, so you can go on." : "Pick a generated asset, something from the library, or upload a file."}
          </div>
        ) : (
          <ul className="grid gap-2" aria-label="Attached media, in the order they are sent">
            {items.map((m, i) => (
              <li key={m._id} draggable={!locked && items.length > 1} onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }} onDragEnd={() => setDrag(null)}
                className={cn("flex flex-wrap items-start gap-3 rounded-xl border p-2", drag === i ? "border-primary opacity-60" : "border-border/60")}>
                {!locked && items.length > 1 && <GripVertical className="mt-6 size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />}
                <MediaThumb media={m} className="size-20 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium">{`${items.length > 1 ? `${i + 1}. ` : ""}${m.name}`}</p>
                  <p className="text-[11px] text-muted-foreground">{[m.kind === "video" ? "Video" : "Picture", m.width && m.height && `${m.width}×${m.height}`, m.durationSec && `${m.durationSec}s`, formatBytes(m.size)].filter(Boolean).join(" · ")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.aiDisclosed && <span className="rounded-full bg-violet-500/12 px-2 py-0.5 text-[10px] font-semibold text-violet-800 dark:text-violet-300">AI generated</span>}
                    {m.source === "ai" && !m.aiDisclosed && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Made in the app</span>}
                  </div>
                  {m.kind === "image" && altWanted && (
                    <AiField fieldKey="media.altText" label="Alt text" id={`alt-${m._id}`} value={alts[m._id] ?? m.altText} disabled={locked || !init.can.upload}
                      getContext={() => ({ name: m.name, kind: m.kind, description: s.topic, caption: s.variants[s.platforms[0]]?.content ?? "", creativePrompt: "" })} aiDisabled={!init.can.generate} aiDisabledReason="AI isn't available to you here."
                      hint={init.can.upload ? "Read by screen readers. Instagram, LinkedIn and X send it with the picture. It is saved to the library item." : "You need media permission to change alt text."} onChange={(x) => setAlts((a) => ({ ...a, [m._id]: String(x) }))} maxLength={300} />
                  )}
                  {m.kind === "image" && altWanted && alts[m._id] !== undefined && alts[m._id] !== m.altText && (
                    <Button type="button" size="xs" variant="outline" disabled={pending} onClick={() => saveAlt(m)}>{pending ? <Loader2 className="size-3 animate-spin" /> : null} Save alt text</Button>
                  )}
                </div>
                {!locked && (
                  <div className="flex items-center gap-0.5">
                    <Button type="button" size="icon-xs" variant="ghost" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${m.name} earlier`}><ArrowUp className="size-3.5" /></Button>
                    <Button type="button" size="icon-xs" variant="ghost" disabled={i === items.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${m.name} later`}><ArrowDown className="size-3.5" /></Button>
                    <Button type="button" size="icon-xs" variant="ghost" onClick={() => remove(m._id)} aria-label={`Remove ${m.name}`}><X className="size-3.5" /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {s.platforms.map((pl) => <FieldError key={pl}>{err(`media.${pl}`)}</FieldError>)}
      </section>

      {thumbWanted && (
        <section className="space-y-2" aria-labelledby="media-cover">
          <h3 id="media-cover" className={sectionTitle}>{s.platforms.includes("youtube") && s.platforms.includes("instagram") ? "Cover / thumbnail" : s.platforms.includes("youtube") ? "YouTube thumbnail" : "Reel cover"}</h3>
          <p className="text-xs text-muted-foreground">An image sent as the video&apos;s cover. {s.platforms.includes("youtube") && "YouTube takes it as the thumbnail (up to 2 MB). "}{s.platforms.includes("instagram") && s.contentTypes.instagram === "reel" && "Instagram uses it as the Reel cover. "}Facebook, LinkedIn and X choose their own.</p>
          <div className="flex flex-wrap items-center gap-3">
            {s.thumbnailId && cards[s.thumbnailId] ? (
              <div className="flex items-center gap-2 rounded-xl border border-border/60 p-1.5 pr-3">
                <MediaThumb media={cards[s.thumbnailId]} className="size-14 rounded-lg" />
                <span className="text-xs">{cards[s.thumbnailId].name}</span>
                {!locked && <Button type="button" size="icon-xs" variant="ghost" aria-label="Remove cover" onClick={() => dispatch({ type: "set", patch: { thumbnailId: null } })}><X className="size-3.5" /></Button>}
              </div>
            ) : <span className="text-xs text-muted-foreground">No cover chosen; the platform picks a frame.</span>}
            {!locked && (
              <>
                {items.filter((m) => m.kind === "image").length > 0 && <Button type="button" size="xs" variant="outline" onClick={() => dispatch({ type: "set", patch: { thumbnailId: items.find((m) => m.kind === "image")!._id } })}>Use the first picture</Button>}
                <AssetPicker kinds={["image"]} onPick={(l) => { setCards(l); dispatch({ type: "set", patch: { thumbnailId: l[0]?._id ?? null } }); }} title="Choose a cover image" trigger={<Button type="button" size="xs" variant="outline">Choose from generated pictures</Button>} />
                <MediaPicker kind="image" multiple={false} canUpload={init.can.upload} onPick={(l) => { setCards(l); dispatch({ type: "set", patch: { thumbnailId: l[0]?._id ?? null } }); }} trigger={<Button type="button" size="xs" variant="outline">Library &amp; upload</Button>} />
              </>
            )}
          </div>
        </section>
      )}

      <section className="space-y-2" aria-labelledby="media-ai">
        <h3 id="media-ai" className={sectionTitle}>AI disclosure</h3>
        {disc.applies ? (
          <Callout tone="info">
            <p className="font-medium">AI-generated media is labelled when it is sent.</p>
            <ul className="list-disc pl-4">{disc.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </Callout>
        ) : <p className="text-xs text-muted-foreground">{disc.lines[0]}</p>}
      </section>

      <section className="space-y-2" aria-labelledby="media-checks" aria-live="polite">
        <div className="flex items-center justify-between gap-2">
          <h3 id="media-checks" className={sectionTitle}>Checked against each platform</h3>
          <Button type="button" size="xs" variant="ghost" onClick={() => void refresh()} disabled={loading}>{loading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Check again</Button>
        </div>
        {error && <Callout tone="warn">{error}</Callout>}
        {!error && loading && !plan && <p className="text-xs text-muted-foreground">Checking…</p>}
        {plan && issues.length === 0 && !loading && <Callout tone="ok">Nothing wrong with the media for {plan.platforms.map((x) => x.label).join(", ")}.</Callout>}
        <ul className="space-y-1.5">
          {issues.map((i, k) => (
            <li key={`${i.platform}-${i.code}-${k}`} className={cn("rounded-xl border px-3 py-2 text-xs", i.severity === "error" ? "border-rose-500/40 bg-rose-500/5" : "border-amber-500/40 bg-amber-500/5")}>
              <p className="flex flex-wrap items-center gap-2"><PlatformChip platform={i.platform} /><span className="font-medium">{i.message}</span><span className="text-[10px] font-semibold uppercase">{i.severity === "error" ? "Must fix" : "Check"}</span></p>
              <p className="mt-0.5 text-muted-foreground">{i.fix}{/aspect|dimension/.test(i.code) && <> <Link href="/viralpulse-ai/generate-image" className="font-semibold text-primary underline">Open Generate Image</Link> to make a version in the right shape.</>}</p>
            </li>
          ))}
        </ul>
        {s.platforms.includes("instagram") && items.some((m) => m.kind === "image" && m.contentType !== "image/jpeg") && <p className="text-[11px] text-muted-foreground">Instagram only takes JPEG: pictures in other formats are converted to JPEG automatically when sent.</p>}
        <p className="text-[11px] text-muted-foreground">{`Platforms: ${s.platforms.map((x) => PLATFORM_META[x].label).join(", ")}. Limits we could not confirm in the platform's documentation show as “Check”, not “Must fix”.`}</p>
      </section>
    </div>
  );
}

export type { WizardState };
