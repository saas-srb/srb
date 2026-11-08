"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Link2, Loader2, Smile, Sparkles, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import PlatformPreview from "@/components/products/viralpulse-ai/PlatformPreview";
import { Field, PlatformChip } from "@/components/products/viralpulse-ai/SmmsBits";
import { adaptPlatformAction } from "@/app/(products)/viralpulse-ai/(protected)/posts/wizard-actions";
import { PLATFORM_META, type PostPlatform } from "@/lib/products/viralpulse-ai/constants";
import { buildUtmUrl, contentTypeDef, defaultUtm, hashtagGuidance, normalizeHashtags, type VariantDraft, EMPTY_VARIANT_DRAFT } from "@/lib/products/viralpulse-ai/post-wizard/helpers";
import { previewFor } from "@/lib/products/viralpulse-ai/post-wizard/preview";
import { Callout, FieldError, HashtagInput, PlatformCounter, Switch, sectionTitle, type StepProps } from "./shared";

const EMOJI = ["😀", "😍", "🔥", "✨", "🎉", "👏", "🙌", "💡", "🚀", "✅", "📣", "📍", "⭐", "❤️", "👉", "🎯", "💼", "📈", "🛍️", "🎬", "📸", "⏰", "🆕", "💬"];

/** How each platform receives the link, from what the publishers actually send. */
const LINK_NOTE: Record<PostPlatform, string> = {
  facebook: "Facebook attaches the link as a link card.",
  linkedin: "LinkedIn adds the link at the end of the text (or shares it as an article).",
  instagram: "Instagram does not send a link on its own. Press “Insert link” to put it in the caption (links are not clickable in captions).",
  youtube: "YouTube does not send a link on its own. Press “Insert link” to put it in the description.",
  x: "X does not send a link on its own. Press “Insert link” to put it in the text. Posts with a link cost more on X's pay-per-use API.",
  google_business: "Google Business Profile uses the link for the post's button.",
};

export default function StepContent(p: StepProps) {
  const { init, s, dispatch, errors, showErrors, locked, ai, ensureSaved, cards } = p;
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const [active, setActive] = useState<PostPlatform>(s.platforms[0]);
  const platform = s.platforms.includes(active) ? active : s.platforms[0];
  const [pending, start] = useTransition();
  const [mention, setMention] = useState("");
  const v: VariantDraft = s.variants[platform] ?? EMPTY_VARIANT_DRAFT;
  const caps = init.caps[platform];
  const meta = PLATFORM_META[platform];
  const type = s.contentTypes[platform];
  const def = contentTypeDef(platform, type);
  const thread = platform === "x" && type === "thread";
  const mediaCards = s.mediaIds.map((id) => cards[id]).filter(Boolean);
  const pv = useMemo(() => previewFor(s, platform, mediaCards, caps, init.settings.aiDisclosureOff), [s, platform, mediaCards, caps, init.settings.aiDisclosureOff]);
  const utm = buildUtmUrl(s.link, s.utm);
  const set = (patch: Partial<VariantDraft>) => dispatch({ type: "variant", platform, patch });
  const finalUrl = s.link.trim() && utm.ok ? utm.url : s.link.trim();
  const uses = (field: "title") => (field === "title" ? platform === "youtube" || platform === "linkedin" && type !== "text" || platform === "facebook" && type === "reel" : false);
  const g = hashtagGuidance(platform, v.hashtags.length);

  function adapt() {
    start(async () => {
      const id = await ensureSaved();
      if (!id) return void toast.error("Save the brief first (the topic is needed).");
      const res = await adaptPlatformAction(id, platform, `Write this for ${meta.label} as a ${def?.label ?? "post"}. Keep the meaning and every fact.`);
      if (!res.ok) return void toast.error(res.error);
      const n = res.variants.find((x) => x.platform === platform);
      if (n) set({ title: n.title, content: n.content, hashtags: normalizeHashtags(n.hashtags), keywords: n.keywords, cta: n.cta });
      toast.success(`${meta.label} version rewritten in its own style.`);
    });
  }

  const insert = (text: string) => set({ content: `${v.content}${v.content && !/\s$/.test(v.content) ? " " : ""}${text}` });

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl border border-border/50 p-4" aria-labelledby="content-link">
        <h3 id="content-link" className={sectionTitle}>Link and tracking (optional)</h3>
        <AiField {...ai("post.link")} label="Link" id="c-link" inputType="url" value={s.link} disabled={locked} placeholder="https://…" hint="Where the post sends people. Leave empty if it has no link." onChange={(x) => dispatch({ type: "set", patch: { link: String(x) } })} />
        <FieldError>{err("link")}</FieldError>
        {s.link.trim() && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs font-medium">
              <Switch checked={s.utm.enabled} disabled={locked} onCheckedChange={(on) => dispatch({ type: "utm", patch: on && !s.utm.campaign ? defaultUtm(s.platforms, s.title || s.topic, init.campaigns.find((c) => c._id === s.campaignId)?.name ?? "") : { enabled: on } })} aria-label="Add tracking tags" />
              Add tracking tags (utm) to the link
            </label>
            {s.utm.enabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="utm_source *" hint="Where the visit comes from, e.g. instagram."><Input value={s.utm.source} disabled={locked} onChange={(e) => dispatch({ type: "utm", patch: { source: e.target.value } })} /></Field>
                <Field label="utm_medium *" hint="The kind of channel, e.g. social."><Input value={s.utm.medium} disabled={locked} onChange={(e) => dispatch({ type: "utm", patch: { medium: e.target.value } })} /></Field>
                <AiField {...ai("post.utm.campaign")} label="utm_campaign *" id="c-utm-c" value={s.utm.campaign} disabled={locked} onChange={(x) => dispatch({ type: "utm", patch: { campaign: String(x) } })} />
                <AiField {...ai("post.utm.content")} label="utm_content" id="c-utm-ct" value={s.utm.content} disabled={locked} onChange={(x) => dispatch({ type: "utm", patch: { content: String(x) } })} />
                <AiField {...ai("post.utm.term")} label="utm_term" id="c-utm-t" value={s.utm.term} disabled={locked} onChange={(x) => dispatch({ type: "utm", patch: { term: String(x) } })} />
              </div>
            )}
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <p className="font-medium">Final link</p>
              <p className="break-all text-muted-foreground" data-testid="final-link">{finalUrl}</p>
            </div>
          </div>
        )}
      </section>

      <PanelTabs label="Platform" active={platform} onSelect={(k) => setActive(k as PostPlatform)} tabs={s.platforms.map((x) => ({ key: x, label: PLATFORM_META[x].label }))} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section className="space-y-4" aria-label={`${meta.label} content`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold"><PlatformChip platform={platform} full /><span className="text-muted-foreground">{def?.label}</span></p>
            <Button type="button" size="sm" variant="outline" onClick={adapt} disabled={pending || locked || !init.can.generate} title={!init.can.generate ? "AI isn't available to you here." : `Rewrites only the ${meta.label} version`}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Rewrite for {meta.label}
            </Button>
          </div>

          {(platform === "youtube" || uses("title")) && (
            <div className="space-y-1">
              <AiField {...ai("post.variant.title", { platform })} label={platform === "youtube" ? "Video title *" : platform === "linkedin" ? (type === "article" ? "Link title *" : "Media title") : "Reel title"} id={`c-title-${platform}`} value={v.title} disabled={locked} maxLength={platform === "youtube" ? 100 : 200} limit={platform === "youtube" ? 100 : null} onChange={(x) => set({ title: String(x) })} />
              <FieldError>{err(`title.${platform}`)}</FieldError>
            </div>
          )}

          <div className="space-y-1">
            <AiField {...ai("post.variant.content", { platform })} label={platform === "youtube" ? "Description" : thread ? "Thread text" : platform === "x" ? "Text" : "Caption / text"} id={`c-text-${platform}`} as="textarea" rows={thread ? 10 : 7} value={v.content} disabled={locked}
              placeholder={thread ? "Write the whole thread; it is split into numbered posts automatically." : undefined} onChange={(x) => set({ content: String(x) })} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <PlatformCounter platform={platform} text={pv.text} limit={caps.captionLimit} thread={thread} />
              <div className="flex flex-wrap items-center gap-1">
                <Popover>
                  <PopoverTrigger render={<Button type="button" size="xs" variant="ghost" disabled={locked} aria-label="Insert an emoji" />}><Smile className="size-3.5" /> Emoji</PopoverTrigger>
                  <PopoverContent align="end" className="w-64">
                    <div className="grid grid-cols-8 gap-1" role="group" aria-label="Emoji">
                      {EMOJI.map((e) => <button key={e} type="button" onClick={() => insert(e)} className="rounded p-1 text-lg hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none" aria-label={`Insert ${e}`}>{e}</button>)}
                    </div>
                  </PopoverContent>
                </Popover>
                {s.link.trim() && <Button type="button" size="xs" variant="ghost" disabled={locked || v.content.includes(finalUrl)} onClick={() => insert(finalUrl)}><Link2 className="size-3.5" /> Insert link</Button>}
              </div>
            </div>
            <FieldError>{err(`content.${platform}`)}</FieldError>
            {s.link.trim() && <p className="text-[11px] text-muted-foreground">{LINK_NOTE[platform]}</p>}
            {pv.truncated && <Callout tone="warn">With hashtags and any AI note added, the text is longer than {meta.label} allows and would be shortened when sent. Shorten it here.</Callout>}
            {pv.disclosure.mode === "suffix" && <p className="text-[11px] text-muted-foreground">{`An AI note is added when sent: “${pv.disclosure.suffix}”`}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <AiField {...ai("post.variant.hashtags", { platform })} label={platform === "youtube" ? "Hashtags (up to 3 show above the title)" : "Hashtags"} id={`c-tags-${platform}`} as="custom" value={v.hashtags} disabled={locked} onChange={(x) => set({ hashtags: normalizeHashtags(Array.isArray(x) ? x : String(x).split(/[\s,]+/)) })}>
              <HashtagInput id={`c-tags-${platform}`} value={v.hashtags} disabled={locked} onChange={(h) => set({ hashtags: h })} />
            </AiField>
            <p className={`text-[11px] sm:max-w-56 ${g.tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{`${v.hashtags.length} added. ${g.text}`}</p>
          </div>

          {platform === "youtube" && (
            <AiField {...ai("post.variant.keywords", { platform })} label="Tags (search keywords)" id="c-kw" as="list" rows={3} value={v.keywords} disabled={locked} hint="One per line. YouTube uses these for search; they are not shown." onChange={(x) => set({ keywords: Array.isArray(x) ? x : String(x).split("\n") })} />
          )}
          {platform === "google_business" && (
            <AiField {...ai("post.variant.cta", { platform })} label="Button" id="c-gbp-cta" value={v.cta} disabled={locked} hint="Becomes the post's button: Learn more, Book, Order, Shop, Sign up or Call." onChange={(x) => set({ cta: String(x) })} />
          )}

          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border/60 p-3">
            <Field label="Mention someone" hint="Type their exact handle. Mentions are plain text; the platform links them." className="min-w-44 flex-1">
              <Input value={mention} disabled={locked} placeholder="@handle" onChange={(e) => setMention(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (mention.trim()) { insert(`@${mention.trim().replace(/^@+/, "")}`); setMention(""); } } }} aria-label="Handle to mention" />
            </Field>
            <Button type="button" size="sm" variant="outline" disabled={locked || !mention.trim()} onClick={() => { insert(`@${mention.trim().replace(/^@+/, "")}`); setMention(""); }}><AtSign className="size-3.5" /> Add to text</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">First comments and tagging people in pictures are not published by the connected accounts yet, so they are not offered here.</p>
        </section>

        <aside className="space-y-3" aria-label={`${meta.label} preview`}>
          <p className="text-xs font-semibold text-muted-foreground">Preview of what will be sent</p>
          <PlatformPreview platform={platform} brand={init.brandName} title={v.title || undefined} body={thread && pv.parts ? pv.parts[0] : pv.text} hashtags={[]} cta={platform === "google_business" ? v.cta : undefined} link={finalUrl || null} media={mediaCards[0] ?? null} aspect={null} />
          {thread && pv.parts && (
            <div className="space-y-1.5" aria-label="Thread parts">
              <p className="text-xs font-semibold">{`Thread: ${pv.parts.length} post${pv.parts.length === 1 ? "" : "s"}`}</p>
              <ol className="space-y-1.5">
                {pv.parts.map((part, i) => (
                  <li key={i} className="rounded-lg border border-border/50 p-2 text-xs"><p className="whitespace-pre-wrap">{part}</p><p className="mt-1 text-[10px] text-muted-foreground">{`Post ${i + 1}: ${part.length} characters`}</p></li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
