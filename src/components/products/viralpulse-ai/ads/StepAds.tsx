"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import AssetPicker from "@/components/products/viralpulse-ai/shared/AssetPicker";
import EmptyState from "@/components/products/viralpulse-ai/shared/EmptyState";
import MediaPicker from "@/components/products/viralpulse-ai/MediaPicker";
import PanelTabs from "@/components/platform/panel/PanelTabs";
import { MediaThumb } from "@/components/products/viralpulse-ai/SmmsBits";
import { leadFormsAction } from "@/app/(products)/viralpulse-ai/(protected)/campaigns/ads-actions";
import { aiFieldAction } from "@/app/(products)/viralpulse-ai/(protected)/ai-field-actions";
import { META_CTA_TYPES, type MetaCtaType } from "@/lib/products/viralpulse-ai/ads-platforms/meta/constants";
import { CTA_BY_OBJECTIVE, ctaLabel, fieldId, placementRatioNotes, type WizardAd } from "@/lib/products/viralpulse-ai/ads-platforms/ui";
import { ctaFromText } from "@/lib/products/viralpulse-ai/ads-platforms/meta/constants";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";
import { ErrorsFor, FieldBox, Note, Section } from "./ads-bits";
import AdPreview from "./AdPreview";
import type { StepCtx } from "./ads-ctx";

const toInfo = (m: MediaCard) => ({ name: m.name, kind: m.kind, width: m.width, height: m.height, durationSec: m.durationSec, aiDisclosed: Boolean(m.aiDisclosed) });

export default function StepAds({ ctx, canUpload, activeKey, onActive }: { ctx: StepCtx; canUpload: boolean; activeKey: string | null; onActive: (k: string | null) => void }) {
  const { state, dispatch, editable, strategy } = ctx;
  const ads = state.ads;
  const sets = state.meta.adSets;
  const ad = ads.find((a) => a.key === activeKey) ?? ads[0] ?? null;
  const addAd = (over?: Partial<WizardAd>) => { dispatch({ type: "addAd", adSetKey: sets[0]?.key ?? null, ad: over }); };

  useEffect(() => { if (ad && ad.key !== activeKey) onActive(ad.key); }, [ad, activeKey, onActive]);

  if (sets.length === 0) return <Note tone="warn">Add at least one ad set in step 3 first. Every ad lives inside an ad set.</Note>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {ads.length > 0 ? <PanelTabs label="Ads" active={ad?.key ?? ""} onSelect={onActive} tabs={ads.map((a, i) => ({ key: a.key, label: a.name || `Ad ${i + 1}` }))} /> : <span />}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!editable || ads.length >= 50} onClick={() => addAd()}><Plus className="size-3.5" /> Add ad</Button>
          {strategy?.adConcepts.filter((c) => c.platform === "facebook" || c.platform === "instagram" || !c.platform).map((c, i) => (
            <Button key={i} type="button" size="sm" variant="outline" disabled={!editable} onClick={() => addAd({ name: c.title, headline: c.headline, primaryText: c.primaryText, description: c.description, format: c.format, platform: c.platform === "instagram" ? "instagram" : "facebook", meta: { ...ctxBlankMeta(), ctaType: ctaFromText(c.cta), creativeType: c.format } })}>
              <Wand2 className="size-3.5" /> From concept: {c.title.slice(0, 24)}
            </Button>
          ))}
        </div>
      </div>
      {!ad ? (
        <EmptyState title="No ads yet" action={<Button type="button" size="sm" disabled={!editable} onClick={() => addAd()}><Plus className="size-3.5" /> Add the first ad</Button>}>An ad is the picture or video, the words and the button people see. Add one per message you want to test.</EmptyState>
      ) : (
        <AdForm key={ad.key} ctx={ctx} ad={ad} canUpload={canUpload} />
      )}
    </div>
  );
}

function ctxBlankMeta() {
  return { adSetKey: null, creativeType: "image" as const, link: "", displayLink: "", ctaType: null, leadFormId: "", urlTags: "", conversionDomain: "", cards: [], extraPrimaryTexts: [], extraHeadlines: [], politicalDeclaration: "none" as const };
}

function AdForm({ ctx, ad, canUpload }: { ctx: StepCtx; ad: WizardAd; canUpload: boolean }) {
  const { state, dispatch, editable, accounts, canGenerate } = ctx;
  const m = ad.meta;
  const set = state.meta.adSets.find((s) => s.key === m.adSetKey) ?? null;
  const base = ad.id ? `ads[${ad.id}]` : `ads[${ad.key}]`;
  const objective = state.meta.objective;
  const page = accounts.pages.find((p) => p.id === state.meta.pageAccountId) ?? null;
  const ig = accounts.instagram.find((i) => i.id === state.meta.instagramAccountId) ?? null;
  const first = ad.mediaIds[0] ? ad.mediaInfo[ad.mediaIds[0]] : undefined;
  const patch = (p: Partial<Omit<WizardAd, "meta">>) => dispatch({ type: "ad", key: ad.key, patch: p });
  const metaPatch = (p: Partial<WizardAd["meta"]>) => dispatch({ type: "adMeta", key: ad.key, patch: p });
  const aiCtx = () => ({ ...ctx.aiContext(), platform: ad.platform, format: ad.format, name: ad.name, headline: ad.headline, primaryText: ad.primaryText, description: ad.description, cta: m.ctaType ? ctaLabel(m.ctaType) : "", landingPage: m.link || state.brief.landingPage });
  const ctaOrdered = useMemo(() => { const first = objective ? CTA_BY_OBJECTIVE[objective] : []; return [...first, ...META_CTA_TYPES.filter((c) => !first.includes(c))]; }, [objective]);
  const isLeadForm = objective === "OUTCOME_LEADS" && set?.destinationType === "ON_AD";
  const needsWeb = set?.destinationType === "WEBSITE" || (!set?.destinationType && (objective === "OUTCOME_TRAFFIC" || objective === "OUTCOME_SALES"));
  const aiMedia = Object.values(ad.mediaInfo).some((x) => x.aiDisclosed);
  const notes = placementRatioNotes(first ?? null, set?.targeting.placements ?? { automatic: true, publisherPlatforms: [], facebookPositions: [], instagramPositions: [], messengerPositions: [], audienceNetworkPositions: [], devicePlatforms: [] });

  const attach = (items: MediaCard[]) => {
    const wanted = m.creativeType === "video" ? ["video", "image"] : ["image"];
    const ok = items.filter((i) => wanted.includes(i.kind));
    if (ok.length === 0) { toast.error(m.creativeType === "video" ? "Choose a video." : "Choose an image."); return; }
    if (m.creativeType === "carousel") {
      metaPatch({ cards: [...m.cards, ...ok.map((i) => ({ mediaId: i._id, headline: "", description: "", link: m.link }))].slice(0, 10) });
      patch({ mediaInfo: { ...ad.mediaInfo, ...Object.fromEntries(ok.map((i) => [i._id, toInfo(i)])) } });
    } else {
      const media = ok.filter((i) => i.kind === (m.creativeType === "video" ? "video" : "image"))[0] ?? ok[0];
      const thumb = m.creativeType === "video" ? ok.find((i) => i.kind === "image") : undefined;
      patch({ mediaIds: [media._id, ...(thumb ? [thumb._id] : [])], mediaInfo: { ...Object.fromEntries([media, ...(thumb ? [thumb] : [])].map((i) => [i._id, toInfo(i)])) } });
    }
  };

  const [forms, setForms] = useState<{ status: "idle" | "loading" | "error" | "ok"; items: { id: string; name: string; status: string | null }[]; error: string | null }>({ status: "idle", items: [], error: null });
  useEffect(() => {
    if (!isLeadForm || !state.meta.pageAccountId) return;
    let live = true;
    const t = setTimeout(async () => {
      setForms((f) => ({ ...f, status: "loading" }));
      const r = await leadFormsAction(state.meta.pageAccountId!);
      if (!live) return;
      setForms(r.ok ? { status: "ok", items: r.forms, error: null } : { status: "error", items: [], error: r.error });
    }, 0);
    return () => { live = false; clearTimeout(t); };
  }, [isLeadForm, state.meta.pageAccountId]);

  // UTM builder: edits the tag string in `urlTags` in place, leaving other parameters untouched.
  const tags = useMemo(() => new URLSearchParams(m.urlTags), [m.urlTags]);
  const setTag = (k: string, v: string) => { const p = new URLSearchParams(m.urlTags); if (v.trim()) p.set(k, v.trim()); else p.delete(k); metaPatch({ urlTags: p.toString() }); };

  const [variantBusy, setVariantBusy] = useState(false);
  async function makeVariants() {
    setVariantBusy(true);
    const [t, h] = await Promise.all([
      aiFieldAction({ fieldKey: "ad.primaryText", mode: "options", context: aiCtx(), current: ad.primaryText || null }),
      aiFieldAction({ fieldKey: "ad.headline", mode: "options", context: aiCtx(), current: ad.headline || null }),
    ]);
    setVariantBusy(false);
    const take = (r: typeof t, own: string) => (r.ok ? (r.options ?? []).map((o) => (Array.isArray(o) ? o.join(" ") : String(o)).trim()).filter((x) => x && x !== own) : []);
    const texts = take(t, ad.primaryText).slice(0, 4);
    const heads = take(h, ad.headline).slice(0, 4);
    if (!t.ok && !h.ok) { toast.error(t.ok ? "The AI could not write variants." : t.error); return; }
    metaPatch({ extraPrimaryTexts: texts, extraHeadlines: heads });
    toast.success(`${texts.length} text and ${heads.length} headline variants added. Read them before launching.`);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <Section title="Ad" description="One ad inside one ad set." actions={<Button type="button" size="sm" variant="outline" disabled={!editable} onClick={() => dispatch({ type: "removeAd", key: ad.key })}><Trash2 className="size-3.5" /> Remove</Button>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBox path={`${base}.meta.adSetKey`} label="Ad set" required help="The audience and budget this ad runs with.">
              <OptionSelect id={fieldId(`${base}.meta.adSetKey`)} value={m.adSetKey ?? ""} disabled={!editable} placeholder="Choose an ad set" options={state.meta.adSets.map((s, i) => ({ value: s.key, label: s.name || `Ad set ${i + 1}` }))} onChange={(v) => metaPatch({ adSetKey: v || null })} />
            </FieldBox>
            <FieldBox label="Runs as" help="Identity from step 1. Change it there.">
              <p className="text-xs font-medium">{page?.name ?? "No Page chosen"}{ig ? ` · @${(ig.handle ?? ig.name).replace(/^@/, "")}` : ""}</p>
            </FieldBox>
          </div>
          <AiField fieldKey="ad.name" label="Ad name" id={fieldId(`${base}.name`)} as="input" value={ad.name} limit={100} disabled={!editable} aiDisabled={!canGenerate} onChange={(v) => patch({ name: String(v) })} getContext={aiCtx} hint="For your team. Meta cuts the creative name to 100 characters." />
          <FieldBox label="Format" help="Single image or video, or a carousel of 2 to 10 cards. Collection ads are not available in this version.">
            <OptionSelect value={m.creativeType} disabled={!editable} options={[{ value: "image", label: "Single image" }, { value: "video", label: "Single video" }, { value: "carousel", label: "Carousel (2 to 10 cards)" }]} onChange={(v) => { const t = v as "image" | "video" | "carousel"; patch({ format: t === "video" ? "video" : "image", mediaIds: [] }); metaPatch({ creativeType: t, cards: t === "carousel" ? m.cards : [] }); }} />
          </FieldBox>
        </Section>

        <Section title="Media" description="From the AI Image Studio, the AI UGC Studio or your media library. Check the shape for where it will run.">
          <div className="flex flex-wrap gap-2">
            <AssetPicker kinds={m.creativeType === "video" ? ["video", "image"] : ["image"]} multiple={m.creativeType === "carousel"} onPick={attach} trigger={<Button type="button" size="sm" variant="outline" disabled={!editable}><Sparkles className="size-3.5" /> From the AI studios</Button>} />
            <MediaPicker kind={m.creativeType === "video" ? "both" : "image"} multiple={m.creativeType === "carousel"} canUpload={canUpload} onPick={attach} trigger={<Button type="button" size="sm" variant="outline" disabled={!editable}><ImagePlus className="size-3.5" /> From the library or upload</Button>} />
          </div>
          <div id={fieldId(`${base}.mediaIds`)} tabIndex={-1} className="space-y-2">
            {m.creativeType !== "carousel" && (ad.mediaIds.length === 0 ? <p className="text-xs text-muted-foreground">No {m.creativeType === "video" ? "video" : "image"} chosen yet.</p> : ad.mediaIds.map((id) => {
              const info = ad.mediaInfo[id];
              return (
                <div key={id} className="flex items-center gap-3 rounded-xl border border-border/50 p-2 text-xs">
                  <MediaThumb media={{ _id: id, kind: info?.kind ?? "image", name: info?.name ?? "Media", thumbnailId: null }} className="size-14 shrink-0" />
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{info?.name ?? id}</p><p className="text-muted-foreground">{info?.kind === "video" ? "Video" : "Image"}{info?.width && info?.height ? ` · ${info.width} x ${info.height}` : ""}{info?.durationSec ? ` · ${info.durationSec}s` : ""}</p></div>
                  <Button type="button" size="xs" variant="ghost" disabled={!editable} onClick={() => patch({ mediaIds: ad.mediaIds.filter((x) => x !== id) })}>Remove</Button>
                </div>
              );
            }))}
            {m.creativeType === "carousel" && (
              <div className="space-y-2">
                {m.cards.length === 0 && <p className="text-xs text-muted-foreground">No cards yet. Add 2 to 10 images or videos.</p>}
                {m.cards.map((card, i) => {
                  const info = ad.mediaInfo[card.mediaId];
                  const upd = (x: Partial<typeof card>) => metaPatch({ cards: m.cards.map((c, j) => (j === i ? { ...c, ...x } : c)) });
                  return (
                    <div key={`${card.mediaId}-${i}`} className="space-y-2 rounded-xl border border-border/50 p-2 text-xs">
                      <div className="flex items-center gap-2"><MediaThumb media={{ _id: card.mediaId, kind: info?.kind ?? "image", name: info?.name ?? "Card", thumbnailId: null }} className="size-12 shrink-0" /><p className="min-w-0 flex-1 truncate font-medium">Card {i + 1}: {info?.name ?? card.mediaId}</p><Button type="button" size="xs" variant="ghost" disabled={!editable} onClick={() => metaPatch({ cards: m.cards.filter((_, j) => j !== i) })}>Remove</Button></div>
                      <FieldBox path={`${base}.meta.cards[${i}].headline`} label="Card headline" required><Input id={fieldId(`${base}.meta.cards[${i}].headline`)} value={card.headline} disabled={!editable} onChange={(e) => upd({ headline: e.target.value })} /></FieldBox>
                      <FieldBox path={`${base}.meta.cards[${i}].link`} label="Card link"><Input id={fieldId(`${base}.meta.cards[${i}].link`)} type="url" value={card.link} disabled={!editable} placeholder="https://" onChange={(e) => upd({ link: e.target.value })} /></FieldBox>
                    </div>
                  );
                })}
                <ErrorsFor path={`${base}.meta.cards`} />
              </div>
            )}
          </div>
          {notes.map((n) => <Note key={n} tone="warn">{n}</Note>)}
          {aiMedia && (
            <Note>
              <p className="font-semibold">This media is marked as AI-generated.</p>
              <p>The marking travels with the file. Meta may add its own &quot;AI info&quot; label, and its policies ask you to disclose realistic AI-made people or events. If the ad is about social issues, elections or politics and uses digitally created media, set the declaration below.</p>
            </Note>
          )}
          <FieldBox path={`${base}.meta.politicalDeclaration`} label="Declaration" help="Only for ads about social issues, elections or politics.">
            <OptionSelect id={fieldId(`${base}.meta.politicalDeclaration`)} value={m.politicalDeclaration} disabled={!editable} options={[{ value: "none", label: "Not a political or social issue ad" }, { value: "political", label: "Social issues, elections or politics" }, { value: "political_digital", label: "Political, with digitally created or altered media" }]} onChange={(v) => metaPatch({ politicalDeclaration: v as typeof m.politicalDeclaration })} />
          </FieldBox>
        </Section>

        <Section title="Words" description="Only first-party facts: the AI works from your brief and your own text and never adds prices, offers or claims.">
          <AiField fieldKey="ad.primaryText" label="Primary text" id={fieldId(`${base}.primaryText`)} as="textarea" rows={4} value={ad.primaryText} limit={2200} disabled={!editable} aiDisabled={!canGenerate} onChange={(v) => patch({ primaryText: String(v) })} getContext={aiCtx} hint="The text above the picture. Only about the first 125 characters show before 'See more'." />
          {m.creativeType !== "carousel" && <AiField fieldKey="ad.headline" label="Headline" id={fieldId(`${base}.headline`)} as="input" value={ad.headline} limit={40} disabled={!editable} aiDisabled={!canGenerate} onChange={(v) => patch({ headline: String(v) })} getContext={aiCtx} hint="Bold line under the picture. About 40 characters fit in most placements." />}
          <AiField fieldKey="ad.description" label="Description" id={fieldId(`${base}.description`)} as="input" value={ad.description} limit={300} disabled={!editable} aiDisabled={!canGenerate} onChange={(v) => patch({ description: String(v) })} getContext={aiCtx} hint="A short supporting line. Not shown in every placement." />
          <div className="space-y-2 rounded-xl border border-dashed border-border/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-xs font-semibold">Text variants for testing</p><p className="text-[11px] text-muted-foreground">Meta rotates up to 4 extra texts and 4 extra headlines and favours the best.</p></div>
              <Button type="button" size="sm" variant="outline" disabled={!editable || !canGenerate || variantBusy || !ad.primaryText.trim()} onClick={() => void makeVariants()}>{variantBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Create variants with AI</Button>
            </div>
            <FieldBox path={`${base}.meta.extraPrimaryTexts`} label="Extra primary texts (one per line)"><Textarea id={fieldId(`${base}.meta.extraPrimaryTexts`)} rows={3} value={m.extraPrimaryTexts.join("\n")} disabled={!editable} onChange={(e) => metaPatch({ extraPrimaryTexts: e.target.value.split("\n").slice(0, 4) })} onBlur={(e) => metaPatch({ extraPrimaryTexts: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 4) })} /></FieldBox>
            <FieldBox path={`${base}.meta.extraHeadlines`} label="Extra headlines (one per line)"><Textarea id={fieldId(`${base}.meta.extraHeadlines`)} rows={2} value={m.extraHeadlines.join("\n")} disabled={!editable} onChange={(e) => metaPatch({ extraHeadlines: e.target.value.split("\n").slice(0, 4) })} onBlur={(e) => metaPatch({ extraHeadlines: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 4) })} /></FieldBox>
          </div>
          <FieldBox path={`${base}.meta.ctaType`} label="Button" help="The call-to-action button. The first ones suit your objective.">
            <OptionSelect id={fieldId(`${base}.meta.ctaType`)} value={m.ctaType ?? ""} disabled={!editable} placeholder="Choose a button" noneLabel="Choose later" options={ctaOrdered.map((c) => ({ value: c, label: ctaLabel(c) }))} onChange={(v) => metaPatch({ ctaType: (v || null) as MetaCtaType | null })} />
          </FieldBox>
        </Section>

        <Section title="Where people go and tracking" description="Destination and the tags that tell your analytics where visits came from.">
          {isLeadForm ? (
            <FieldBox path={`${base}.meta.leadFormId`} label="Instant form" required help="The lead form on your Page that opens from the ad. Forms are created in Meta on the Page; reload this list after creating one.">
              <OptionSelect id={fieldId(`${base}.meta.leadFormId`)} value={m.leadFormId} disabled={!editable || forms.status === "loading"} placeholder={forms.status === "loading" ? "Loading forms…" : "Choose a form"} options={forms.items.map((f) => ({ value: f.id, label: `${f.name}${f.status ? ` (${f.status.toLowerCase()})` : ""}` }))} onChange={(v) => metaPatch({ leadFormId: v })} />
              {forms.status === "error" && <p role="alert" className="text-[11px] text-rose-700 dark:text-rose-300">{forms.error}</p>}
              {forms.status === "ok" && forms.items.length === 0 && <p className="text-[11px] text-muted-foreground">This Page has no lead forms yet.</p>}
            </FieldBox>
          ) : (
            <>
              <FieldBox path={`${base}.meta.link`} label="Website address" required={needsWeb} help="Where people land. Must start with https://.">
                <Input id={fieldId(`${base}.meta.link`)} type="url" value={m.link} disabled={!editable} placeholder="https://" onChange={(e) => metaPatch({ link: e.target.value.trim() })} />
              </FieldBox>
              <FieldBox path={`${base}.meta.displayLink`} label="Display link (optional)" help="A shorter address shown instead of the full one, for example example.com."><Input id={fieldId(`${base}.meta.displayLink`)} value={m.displayLink} disabled={!editable} onChange={(e) => metaPatch({ displayLink: e.target.value })} /></FieldBox>
              <FieldBox path={`${base}.meta.conversionDomain`} label="Conversion domain" required={Boolean(set?.promotedObject.pixelId)} help="The domain of your website, such as example.com. Needed when the ad set uses a pixel."><Input id={fieldId(`${base}.meta.conversionDomain`)} value={m.conversionDomain} disabled={!editable} placeholder="example.com" onChange={(e) => metaPatch({ conversionDomain: e.target.value.trim() })} /></FieldBox>
              {set?.promotedObject.objectStoreUrl && <p className="text-[11px] text-muted-foreground">App store link (from the ad set): {set.promotedObject.objectStoreUrl}</p>}
            </>
          )}
          <FieldBox path={`${base}.meta.urlTags`} label="URL parameters" help="Added to the link when someone clicks. Written without a leading ? or &.">
            <div className="grid gap-2 sm:grid-cols-5" role="group" aria-label="UTM builder">
              {(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const).map((k) => (
                <Input key={k} aria-label={k} placeholder={k} value={tags.get(k) ?? ""} disabled={!editable} onChange={(e) => setTag(k, e.target.value)} className="h-8 text-xs" />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input id={fieldId(`${base}.meta.urlTags`)} value={m.urlTags} disabled={!editable} placeholder="utm_source=meta&utm_medium=paid" onChange={(e) => metaPatch({ urlTags: e.target.value })} />
              <Button type="button" size="sm" variant="outline" disabled={!editable} onClick={() => { const p = new URLSearchParams(m.urlTags); if (!p.get("utm_source")) p.set("utm_source", "meta"); if (!p.get("utm_medium")) p.set("utm_medium", "paid"); if (!p.get("utm_campaign") && state.name) p.set("utm_campaign", state.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); metaPatch({ urlTags: p.toString() }); }}>Fill common tags</Button>
            </div>
          </FieldBox>
          <p className="text-[11px] text-muted-foreground">Conversions are counted by the pixel and event chosen on the ad set. Offline conversions are not available in this version.</p>
          <p className="text-[11px] text-muted-foreground">Everything is created paused. Nothing spends until the spend is approved and someone switches it on.</p>
        </Section>
      </div>
      <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start" aria-label="Preview">
        <AdPreview pageName={page?.name ?? null} igHandle={ig ? (ig.handle ?? ig.name) : null} primaryText={ad.primaryText} headline={ad.headline} description={ad.description} cta={m.ctaType ? ctaLabel(m.ctaType) : null} displayLink={m.displayLink || (m.link ? safeHost(m.link) : "")} media={ad.mediaIds[0] ? { id: ad.mediaIds[0], kind: first?.kind ?? "image", name: first?.name ?? "Media" } : m.cards[0] ? { id: m.cards[0].mediaId, kind: ad.mediaInfo[m.cards[0].mediaId]?.kind ?? "image", name: "Card 1" } : null} politicalLabel={m.politicalDeclaration !== "none"} />
      </aside>
    </div>
  );
}

function safeHost(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
}
