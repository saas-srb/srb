"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Undo2, ImagePlus, Sparkles, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { StructuredFields, type FieldSpec } from "@/components/products/viralpulse-ai/StructuredEditor";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import { SectionCard } from "@/components/products/viralpulse-ai/SmmsUi";
import PlatformPreview from "@/components/products/viralpulse-ai/PlatformPreview";
import MediaPicker, { AttachedMedia } from "@/components/products/viralpulse-ai/MediaPicker";
import { saveAdAction, generateAdImageAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import { PLATFORM_META, findFormat, type AdPlatform } from "@/lib/products/viralpulse-ai/constants";
import type { AdContent } from "@/lib/products/viralpulse-ai/content";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";

const SCENES: FieldSpec = {
  key: "scenes",
  label: "Scene-by-scene structure",
  kind: "objects",
  itemLabel: "Scene",
  blank: { scene: "", duration: "", visual: "", onScreenText: "", voiceover: "" },
  fields: [
    { key: "scene", label: "Scene", kind: "text" },
    { key: "duration", label: "Duration", kind: "text" },
    { key: "visual", label: "Visual", kind: "textarea", rows: 2 },
    { key: "onScreenText", label: "On-screen text", kind: "text", wide: true },
    { key: "voiceover", label: "Voiceover", kind: "textarea", rows: 2 },
  ],
};

export interface AdEditorProps {
  campaignId: string;
  adId: string;
  platforms: AdPlatform[];
  header: { name: string; platform: AdPlatform; format: "image" | "video"; formatKey: string | null };
  content: AdContent;
  media: MediaCard[];
  thumbnail: MediaCard | null;
  brand: string;
  landingPage: string;
  /** The campaign brief (see `campaignBriefContext`), read by the AI buttons. */
  campaign: Record<string, unknown>;
  canEdit: boolean;
  canGenerate: boolean;
  canUpload: boolean;
}

export default function AdEditor(p: AdEditorProps) {
  const router = useRouter();
  const [header, setHeader] = useState(p.header);
  const [content, setContent] = useState<AdContent>(p.content);
  const [media, setMedia] = useState<MediaCard[]>(p.media);
  const [thumbnail, setThumbnail] = useState<MediaCard | null>(p.thumbnail);
  const [dirty, setDirty] = useState(false);
  const [variation, setVariation] = useState(-1);
  const [saving, startSave] = useTransition();
  const [imaging, startImage] = useTransition();
  const meta = PLATFORM_META[header.platform];
  const fmt = findFormat(header.platform, header.formatKey);
  const sizes = meta.formats.filter((f) => f.kind === "both" || f.kind === header.format);
  const touch = () => setDirty(true);
  // What every AI button in this editor reads: the ad as it stands now and the campaign it belongs to.
  const adContext = (): Record<string, unknown> => ({
    platform: header.platform, format: header.format, formatKey: fmt ? `${fmt.label} ${fmt.width}x${fmt.height}` : "", name: header.name, landingPage: p.landingPage, campaign: p.campaign, platforms: p.platforms,
    offerId: p.campaign.offerId, clientId: p.campaign.clientId, tone: p.campaign.tone, language: p.campaign.language,
    content: { headline: content.headline, primaryText: content.primaryText, description: content.description, cta: content.cta, caption: content.caption, hashtags: content.hashtags, keywords: content.keywords },
  });
  const aiEnabled = p.canEdit && p.canGenerate;
  const aiProps = (scope: string) => ({ scope, enabled: aiEnabled, getContext: adContext });

  const copySpec: FieldSpec[] = useMemo(
    () => [
      { key: "headline", label: "Headline", kind: "text", limit: meta.headlineLimit, wide: true },
      { key: "primaryText", label: "Primary text / ad copy", kind: "textarea", rows: 4, limit: meta.captionLimit },
      { key: "description", label: "Description", kind: "textarea", rows: 2 },
      { key: "cta", label: "CTA", kind: "text" },
      { key: "caption", label: "Caption", kind: "textarea", rows: 2, limit: meta.captionLimit },
      { key: "hashtags", label: "Hashtags", kind: "list", rows: 2, placeholder: meta.hashtagAdvice },
      { key: "keywords", label: "Keywords", kind: "list", rows: 2 },
      { key: "audienceSuggestions", label: "Audience suggestions", kind: "list", rows: 3 },
    ],
    [meta]
  );
  const imageSpec: FieldSpec[] = [
    { key: "concept", label: "Ad image concept", kind: "textarea", rows: 3 },
    { key: "prompt", label: "Creative prompt (for AI image generation)", kind: "textarea", rows: 4 },
    { key: "overlayText", label: "Overlay text", kind: "text", wide: true },
    { key: "designNotes", label: "Overlay / design guidance", kind: "textarea", rows: 3 },
  ];
  const videoSpec: FieldSpec[] = [
    { key: "concept", label: "Video concept", kind: "textarea", rows: 3 },
    { key: "hook", label: "Hook (first 1–3 s)", kind: "textarea", rows: 2 },
    SCENES,
    { key: "voiceoverScript", label: "Voiceover script", kind: "textarea", rows: 5 },
    { key: "onScreenText", label: "On-screen text", kind: "list", rows: 3 },
    { key: "thumbnailConcept", label: "Thumbnail concept", kind: "textarea", rows: 2 },
    { key: "durationSec", label: "Length (seconds)", kind: "number" },
  ];
  const variationSpec: FieldSpec[] = [
    {
      key: "variations",
      label: "Ad variations",
      kind: "objects",
      itemLabel: "Variation",
      blank: { label: "", headline: "", primaryText: "", description: "", cta: "" },
      fields: [
        { key: "label", label: "Angle", kind: "text" },
        { key: "cta", label: "CTA", kind: "text" },
        { key: "headline", label: "Headline", kind: "text", wide: true, limit: meta.headlineLimit },
        { key: "primaryText", label: "Primary text", kind: "textarea", rows: 3 },
        { key: "description", label: "Description", kind: "textarea", rows: 2 },
      ],
    },
  ];

  function save() {
    startSave(async () => {
      const res = await saveAdAction(p.campaignId, p.adId, { header, content, mediaIds: media.map((m) => m._id), thumbnailId: thumbnail?._id ?? null });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(`Saved as version ${res.version}.`);
        setDirty(false);
        router.refresh();
      }
    });
  }

  function generateImage(prompt: string) {
    startImage(async () => {
      const res = await generateAdImageAction(p.campaignId, p.adId, prompt);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Image generated and added to the media library.");
      if (header.format === "video") setThumbnail((t) => t ?? res.media);
      else setMedia((m) => [...m, res.media]);
    });
  }

  const v = variation >= 0 ? content.variations[variation] : null;
  const previewMedia = header.format === "video" ? (media.find((m) => m.kind === "video") ? { ...media.find((m) => m.kind === "video")!, thumbnailId: thumbnail?._id ?? media.find((m) => m.kind === "video")!.thumbnailId } : thumbnail) : (media[0] ?? null);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4 self-start">
        <SectionCard title="Ad setup">
          <div className="grid gap-3 sm:grid-cols-4">
            <AiField fieldKey="ad.name" label="Ad name" id="ad-name" className="sm:col-span-4" value={header.name} disabled={!p.canEdit} aiDisabled={!aiEnabled} getContext={adContext} onChange={(x) => { setHeader({ ...header, name: String(x) }); touch(); }} />
            <AiField fieldKey="ad.platform" label="Platform" as="custom" disabled={!p.canEdit} aiDisabled={!aiEnabled} enumOptions={p.platforms} getContext={adContext} value={header.platform} onChange={(x) => { setHeader({ ...header, platform: String(x) as AdPlatform, formatKey: null }); touch(); }}>
              <OptionSelect value={header.platform} disabled={!p.canEdit} onChange={(x) => { setHeader({ ...header, platform: x as AdPlatform, formatKey: null }); touch(); }} options={p.platforms.map((x) => ({ value: x, label: PLATFORM_META[x].label }))} aria-label="Platform" />
            </AiField>
            <AiField fieldKey="ad.format" label="Format" as="custom" disabled={!p.canEdit} aiDisabled={!aiEnabled} getContext={adContext} value={header.format} onChange={(x) => { setHeader({ ...header, format: x === "video" ? "video" : "image", formatKey: null }); touch(); }}>
              <OptionSelect value={header.format} disabled={!p.canEdit} onChange={(x) => { setHeader({ ...header, format: x === "video" ? "video" : "image", formatKey: null }); touch(); }} options={[{ value: "image", label: "Image ad" }, { value: "video", label: "Video ad" }]} aria-label="Format" />
            </AiField>
            <AiField fieldKey="ad.formatKey" label="Size / placement" as="custom" className="sm:col-span-2" disabled={!p.canEdit} aiDisabled={!aiEnabled} enumOptions={sizes.map((f) => f.key)} getContext={adContext} value={header.formatKey ?? ""} onChange={(x) => { setHeader({ ...header, formatKey: String(x) || null }); touch(); }}>
              <OptionSelect value={header.formatKey ?? ""} disabled={!p.canEdit} onChange={(x) => { setHeader({ ...header, formatKey: x || null }); touch(); }} options={sizes.map((f) => ({ value: f.key, label: `${f.label} · ${f.width}×${f.height}` }))} noneLabel="Not chosen" aria-label="Size" />
            </AiField>
          </div>
        </SectionCard>

        <SectionCard title="Ad copy" description={`${meta.label}: body up to ${meta.captionLimit} characters${meta.headlineLimit ? `, headline up to ${meta.headlineLimit}` : ""}.`}>
          <StructuredFields specs={copySpec} value={content as unknown as Record<string, unknown>} disabled={!p.canEdit} idPrefix="adc" ai={aiProps("ad")} onChange={(x) => { setContent(x as unknown as AdContent); touch(); }} />
        </SectionCard>

        {header.format === "image" ? (
          <SectionCard title="Image creative" description={fmt ? `Target size ${fmt.width}×${fmt.height} (${fmt.label}).` : "Choose a size above for size-specific guidance."}>
            <StructuredFields specs={imageSpec} value={content.image as unknown as Record<string, unknown>} disabled={!p.canEdit} idPrefix="adi" ai={aiProps("ad.image")} onChange={(x) => { setContent({ ...content, image: x as unknown as AdContent["image"] }); touch(); }} />
            {p.canEdit && p.canGenerate && (
              <Button type="button" size="sm" variant="outline" className="mt-3" disabled={imaging || !content.image.prompt.trim()} onClick={() => generateImage(content.image.prompt)}>
                {imaging ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {imaging ? "Generating image…" : "Generate image from prompt"}
              </Button>
            )}
          </SectionCard>
        ) : (
          <SectionCard title="Video creative" description={fmt ? `Target ${fmt.width}×${fmt.height} (${fmt.label}).` : undefined}>
            <StructuredFields specs={videoSpec} value={content.video as unknown as Record<string, unknown>} disabled={!p.canEdit} idPrefix="adv" ai={aiProps("ad.video")} onChange={(x) => { setContent({ ...content, video: x as unknown as AdContent["video"] }); touch(); }} />
            {p.canEdit && p.canGenerate && (
              <Button type="button" size="sm" variant="outline" className="mt-3" disabled={imaging || !content.video.thumbnailConcept.trim()} onClick={() => generateImage(`YouTube-style video thumbnail, bold and legible at small size: ${content.video.thumbnailConcept}`)}>
                {imaging ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {imaging ? "Generating thumbnail…" : "Generate thumbnail from concept"}
              </Button>
            )}
          </SectionCard>
        )}

        <SectionCard title="Variations">
          <StructuredFields specs={variationSpec} value={content as unknown as Record<string, unknown>} disabled={!p.canEdit} idPrefix="adva" ai={aiProps("ad")} onChange={(x) => { setContent(x as unknown as AdContent); touch(); }} />
        </SectionCard>

        <SectionCard title={header.format === "video" ? "Video & thumbnail" : "Images"} description={header.format === "video" ? "Attach the ad video (upload or pick from the library) and a thumbnail image." : "Attach one or more images (carousel)."}>
          <div className="space-y-3">
            <AttachedMedia items={media} disabled={!p.canEdit} onRemove={(id) => { setMedia((m) => m.filter((x) => x._id !== id)); touch(); }} />
            {p.canEdit && (
              <MediaPicker kind={header.format === "video" ? "both" : "image"} multiple canUpload={p.canUpload} onPick={(items) => { setMedia((m) => [...m, ...items.filter((i) => !m.some((x) => x._id === i._id))].slice(0, 10)); touch(); }} trigger={<Button type="button" size="sm" variant="outline"><Paperclip className="size-4" /> Attach media</Button>} />
            )}
            {header.format === "video" && (
              <div className="space-y-2 border-t border-border/40 pt-3">
                <p className="text-xs font-medium">Thumbnail</p>
                <AttachedMedia items={thumbnail ? [thumbnail] : []} disabled={!p.canEdit} onRemove={() => { setThumbnail(null); touch(); }} />
                {p.canEdit && <MediaPicker kind="image" multiple={false} canUpload={p.canUpload} onPick={(items) => { setThumbnail(items[0] ?? null); touch(); }} trigger={<Button type="button" size="sm" variant="outline"><ImagePlus className="size-4" /> Choose thumbnail</Button>} />}
              </div>
            )}
          </div>
        </SectionCard>

        {p.canEdit && (
          <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 rounded-xl border border-border/50 bg-background/95 p-2 backdrop-blur">
            <Button type="button" onClick={save} disabled={!dirty || saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save ad</Button>
            <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { setHeader(p.header); setContent(p.content); setMedia(p.media); setThumbnail(p.thumbnail); setDirty(false); }}><Undo2 className="size-4" /> Discard</Button>
            {dirty && <span className="self-center text-xs text-amber-600 dark:text-amber-400">Unsaved changes — save before regenerating</span>}
          </div>
        )}
      </div>

      <div className="space-y-3 self-start xl:sticky xl:top-0">
        <SectionCard title="Preview" description="Approximate layout for review.">
          {content.variations.length > 0 && (
            <div className="mb-3">
              <OptionSelect value={String(variation)} onChange={(x) => setVariation(Number(x))} options={[{ value: "-1", label: "Main copy" }, ...content.variations.map((x, i) => ({ value: String(i), label: `Variation ${i + 1}${x.label ? ` — ${x.label}` : ""}` }))]} aria-label="Preview variation" />
            </div>
          )}
          <PlatformPreview
            platform={header.platform}
            brand={p.brand}
            sponsored
            title={v?.headline ?? content.headline}
            body={v?.primaryText ?? content.primaryText}
            description={v?.description ?? content.description}
            hashtags={content.hashtags}
            cta={v?.cta ?? content.cta}
            link={p.landingPage || null}
            media={previewMedia}
            aspect={fmt}
          />
        </SectionCard>
      </div>
    </div>
  );
}
