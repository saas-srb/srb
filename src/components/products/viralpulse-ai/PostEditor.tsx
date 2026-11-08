"use client";

import PanelTabs from "@/components/platform/panel/PanelTabs";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Undo2, Sparkles, Paperclip, ImagePlus, Lock, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import { StructuredFields, type FieldSpec } from "@/components/products/viralpulse-ai/StructuredEditor";
import { PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import { SectionCard } from "@/components/products/viralpulse-ai/SmmsUi";
import PlatformPreview from "@/components/products/viralpulse-ai/PlatformPreview";
import MediaPicker, { AttachedMedia } from "@/components/products/viralpulse-ai/MediaPicker";
import { savePostContentAction, generatePostAction, generatePostImageAction } from "@/app/(products)/viralpulse-ai/(protected)/actions";
import { PLATFORM_META, type PostPlatform } from "@/lib/products/viralpulse-ai/constants";
import type { PostCreative, PostVariantContent } from "@/lib/products/viralpulse-ai/content";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";

export interface EditorVariant extends PostVariantContent {
  platform: PostPlatform;
  published: boolean;
}

export interface PostEditorProps {
  postId: string;
  contentType: "image" | "video";
  idea: string;
  creative: PostCreative;
  variants: EditorVariant[];
  media: MediaCard[];
  thumbnail: MediaCard | null;
  brand: string;
  link: string | null;
  /** The post brief (topic, objective, audience, tone...) read by the AI buttons. */
  brief: Record<string, unknown>;
  canEdit: boolean;
  canGenerate: boolean;
  canUpload: boolean;
}

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

export default function PostEditor(p: PostEditorProps) {
  const router = useRouter();
  const [idea, setIdea] = useState(p.idea);
  const [creative, setCreative] = useState(p.creative);
  const [variants, setVariants] = useState(p.variants);
  const [media, setMedia] = useState(p.media);
  const [thumbnail, setThumbnail] = useState(p.thumbnail);
  const [tab, setTab] = useState<PostPlatform>(p.variants[0]?.platform ?? "instagram");
  const [dirty, setDirty] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [saving, startSave] = useTransition();
  const [regen, startRegen] = useTransition();
  const [imaging, startImage] = useTransition();
  const [imgFormat, setImgFormat] = useState("");
  const touch = () => setDirty(true);
  const current = variants.find((v) => v.platform === tab) ?? variants[0];
  const meta = current ? PLATFORM_META[current.platform] : null;
  const aiEnabled = p.canEdit && p.canGenerate;
  const postContext = (): Record<string, unknown> => ({ ...p.brief, idea, platform: current?.platform ?? "", variant: current ? { title: current.title, content: current.content, caption: current.caption, cta: current.cta, hashtags: current.hashtags, keywords: current.keywords } : null, creative });

  const variantSpec: FieldSpec[] = meta
    ? [
        ...(meta.headlineLimit ? [{ key: "title", label: current.platform === "youtube" ? "Video title" : "Headline / title", kind: "text", limit: meta.headlineLimit, wide: true } as FieldSpec] : []),
        { key: "content", label: current.platform === "youtube" ? "Description" : "Post content", kind: "textarea", rows: 7, limit: meta.captionLimit },
        { key: "caption", label: "Caption / first-line hook", kind: "textarea", rows: 2 },
        { key: "cta", label: "CTA", kind: "text" },
        { key: "hashtags", label: "Hashtags", kind: "list", rows: 2, placeholder: meta.hashtagAdvice },
        { key: "keywords", label: current.platform === "youtube" ? "Tags / keywords" : "Keywords", kind: "list", rows: 2 },
      ]
    : [];
  const creativeSpec: FieldSpec[] =
    p.contentType === "video"
      ? [
          { key: "videoConcept", label: "Video concept", kind: "textarea", rows: 3 },
          { key: "hook", label: "Hook", kind: "textarea", rows: 2 },
          { key: "videoScript", label: "Video script", kind: "textarea", rows: 6 },
          SCENES,
          { key: "thumbnailConcept", label: "Thumbnail concept", kind: "textarea", rows: 2 },
        ]
      : [
          { key: "imageConcept", label: "Image creative concept", kind: "textarea", rows: 3 },
          { key: "imagePrompt", label: "Creative prompt (for AI image generation)", kind: "textarea", rows: 4 },
        ];

  function save() {
    startSave(async () => {
      const res = await savePostContentAction(p.postId, { idea, creative, variants, mediaIds: media.map((m) => m._id), thumbnailId: thumbnail?._id ?? null });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(`Saved as version ${res.version}.`);
        setDirty(false);
        router.refresh();
      }
    });
  }

  function regenerateOne() {
    if (dirty && !confirm("You have unsaved edits — regenerating reloads the post and discards them. Continue?")) return;
    startRegen(async () => {
      const res = await generatePostAction(p.postId, instruction.trim() || undefined, tab);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(`${PLATFORM_META[tab].label} version regenerated (v${res.version}).`);
        setInstruction("");
        router.refresh();
      }
    });
  }

  function generateImage() {
    const prompt = p.contentType === "video" ? `Social video thumbnail / cover, bold and legible at small size: ${creative.thumbnailConcept}` : creative.imagePrompt;
    startImage(async () => {
      const res = await generatePostImageAction(p.postId, prompt, tab, imgFormat || null);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Image generated and added to the media library.");
      if (p.contentType === "video") setThumbnail((t) => t ?? res.media);
      else setMedia((m) => [...m, res.media]);
    });
  }

  const video = media.find((m) => m.kind === "video");
  const previewMedia = p.contentType === "video" ? (video ? { ...video, thumbnailId: thumbnail?._id ?? video.thumbnailId } : thumbnail) : (media[0] ?? null);
  const imgFormats = meta ? meta.formats.filter((f) => f.kind !== "video") : [];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4 self-start">
        <SectionCard title="Core idea" description="The single idea every platform version is adapted from.">
          <AiField fieldKey="post.idea" label="Core idea" id="post-idea" as="textarea" rows={2} value={idea} disabled={!p.canEdit} aiDisabled={!aiEnabled} getContext={postContext} onChange={(x) => { setIdea(String(x)); touch(); }} placeholder="Generate with AI or write the idea" />
        </SectionCard>

        <SectionCard title="Platform versions" description="Each platform gets its own version within its limits and conventions.">
          <PanelTabs className="mb-3" active={tab} onSelect={(k) => setTab(k as PostPlatform)} tabs={variants.map((v) => ({ key: v.platform, label: <><PlatformChip platform={v.platform} full />{v.published && <Lock className="size-3 text-emerald-600" aria-label="Published" />}</> }))} />
          {current && (
            <>
              {current.published && <p className="mb-2 text-xs text-emerald-700 dark:text-emerald-400">Published — this version is locked as a record of what went out.</p>}
              <StructuredFields
                key={current.platform}
                specs={variantSpec}
                value={current as unknown as Record<string, unknown>}
                disabled={!p.canEdit || current.published}
                idPrefix={`pv-${current.platform}`}
                ai={{ scope: "post.variant", enabled: aiEnabled, getContext: postContext }}
                onChange={(x) => { setVariants((vs) => vs.map((v) => (v.platform === current.platform ? { ...v, ...(x as unknown as PostVariantContent) } : v))); touch(); }}
              />
              {p.canEdit && p.canGenerate && !current.published && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-2">
                  <Input value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={`Optional: how to change the ${PLATFORM_META[current.platform].label} version`} className="h-8 min-w-48 flex-1" maxLength={1000} disabled={regen} />
                  <Button type="button" size="sm" variant="outline" onClick={regenerateOne} disabled={regen}>
                    {regen ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} {`Regenerate ${PLATFORM_META[current.platform].short} version`}
                  </Button>
                </div>
              )}
            </>
          )}
        </SectionCard>

        <SectionCard title={p.contentType === "video" ? "Video creative" : "Image creative"}>
          <StructuredFields specs={creativeSpec} value={creative as unknown as Record<string, unknown>} disabled={!p.canEdit} idPrefix="pc" ai={{ scope: "post.creative", enabled: aiEnabled, getContext: postContext }} onChange={(x) => { setCreative(x as unknown as PostCreative); touch(); }} />
          {p.canEdit && p.canGenerate && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {p.contentType === "image" && imgFormats.length > 0 && (
                <div className="w-56"><OptionSelect value={imgFormat} onChange={setImgFormat} options={imgFormats.map((f) => ({ value: f.key, label: `${f.label} · ${f.width}×${f.height}` }))} noneLabel="Square (default)" aria-label="Image size" /></div>
              )}
              <Button type="button" size="sm" variant="outline" disabled={imaging || !(p.contentType === "video" ? creative.thumbnailConcept : creative.imagePrompt).trim()} onClick={generateImage}>
                {imaging ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {imaging ? "Generating…" : p.contentType === "video" ? "Generate thumbnail" : `Generate image for ${meta?.short ?? ""}`}
              </Button>
            </div>
          )}
        </SectionCard>

        <SectionCard title={p.contentType === "video" ? "Video & thumbnail" : "Images"} description="Upload, or pick from the media library.">
          <div className="space-y-3">
            <AttachedMedia items={media} disabled={!p.canEdit} onRemove={(id) => { setMedia((m) => m.filter((x) => x._id !== id)); touch(); }} />
            {p.canEdit && <MediaPicker kind={p.contentType === "video" ? "both" : "image"} multiple canUpload={p.canUpload} onPick={(items) => { setMedia((m) => [...m, ...items.filter((i) => !m.some((x) => x._id === i._id))].slice(0, 10)); touch(); }} trigger={<Button type="button" size="sm" variant="outline"><Paperclip className="size-4" /> Attach media</Button>} />}
            {p.contentType === "video" && (
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
            <Button type="button" onClick={save} disabled={!dirty || saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save post</Button>
            <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { setIdea(p.idea); setCreative(p.creative); setVariants(p.variants); setMedia(p.media); setThumbnail(p.thumbnail); setDirty(false); }}><Undo2 className="size-4" /> Discard</Button>
            {dirty && <span className="self-center text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
          </div>
        )}
      </div>

      <div className="space-y-3 self-start xl:sticky xl:top-0">
        <SectionCard title={`Preview · ${meta?.label ?? ""}`} description="Switch platform tabs to preview each version.">
          {current ? <PlatformPreview platform={current.platform} brand={p.brand} title={current.title} body={current.content || current.caption} hashtags={current.hashtags} cta={current.cta} link={p.link} media={previewMedia} /> : null}
        </SectionCard>
      </div>
    </div>
  );
}
