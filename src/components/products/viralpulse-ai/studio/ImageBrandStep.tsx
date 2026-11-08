"use client";

import Link from "next/link";
import { ImagePlus, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import MediaPicker from "@/components/products/viralpulse-ai/MediaPicker";
import { MediaThumb, mediaSrc } from "@/components/products/viralpulse-ai/SmmsBits";
import { Notice } from "@/components/products/viralpulse-ai/SmmsUi";
import type { StudioConfig } from "@/components/products/viralpulse-ai/studio/config";
import { PolicyBox } from "@/components/products/viralpulse-ai/studio/ImageBriefStep";
import { LOGO_PLACEMENTS, type Brief, type Consent } from "@/lib/products/viralpulse-ai/images/types";
import type { Errors } from "@/lib/products/viralpulse-ai/images/wizard";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";

const NO_CONSENT: Consent = { attested: false, showsPeople: false, publicFigure: false, at: null, by: null };

export default function ImageBrandStep({ brief, set, errors, config, disabled }: { brief: Brief; set: (patch: Partial<Brief>) => void; errors: Errors; config: StudioConfig; disabled: boolean }) {
  const kit = config.kit;
  const c = brief.consent ?? NO_CONSENT;
  const kitEmpty = !kit.voice && !Object.values(kit.colours).some(Boolean) && !kit.dos.length && !kit.donts.length && !kit.logoMediaId;
  const upd = (patch: Partial<Consent>) => set({ consent: { ...c, ...patch } });
  const placement = LOGO_PLACEMENTS.find((p) => p.value === kit.logoPlacement)?.label.toLowerCase() ?? kit.logoPlacement;
  return (
    <div className="space-y-6">
      <section aria-label="Brand kit" className="space-y-3 rounded-2xl border border-border/40 bg-background/50 p-3">
        <label className="flex items-start gap-2 text-sm font-semibold"><input type="checkbox" className="mt-1" disabled={disabled} checked={brief.applyKit} onChange={(e) => set({ applyKit: e.target.checked })} /> Apply my brand kit to this picture</label>
        {kitEmpty ? (
          <p className="text-xs text-muted-foreground">Your brand kit is empty. <Link className="font-semibold text-primary underline" href="/viralpulse-ai/brand-kit">Add a logo, colours and rules</Link> and they are used here automatically.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/40 p-3 text-sm">
              <p className="font-semibold">Logo</p>
              {config.logo ? (
                <div className="mt-2 flex items-center gap-3">
                  <MediaThumb media={config.logo} className="size-16 bg-white" />
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>{`Placed ${placement} at ${(kit.logoScale * 100).toFixed(0)}% of the width.`}</p>
                    <label className="flex items-center gap-2 text-foreground"><input type="checkbox" disabled={disabled || !brief.applyKit} checked={!!brief.applyLogo} onChange={(e) => set({ applyLogo: e.target.checked })} /> Put the logo on the exports</label>
                  </div>
                </div>
              ) : <p className="mt-1 text-xs text-muted-foreground">No logo yet.</p>}
            </div>
            <div className="rounded-xl border border-border/40 p-3 text-sm">
              <p className="font-semibold">Voice, colours and rules</p>
              <p className="mt-1 text-xs text-muted-foreground">{[kit.voice, Object.values(kit.colours).filter(Boolean).join(" "), kit.dos.length ? `${kit.dos.length} always` : "", kit.donts.length ? `${kit.donts.length} never` : ""].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Edit the kit on the <Link className="font-semibold text-primary underline" href="/viralpulse-ai/brand-kit">Brand Kit page</Link>. Changes apply to the next picture you generate.</p>
      </section>

      <section aria-label="Reference pictures" className="space-y-3 rounded-2xl border border-border/40 bg-background/50 p-3">
        <div>
          <h3 className="text-sm font-bold">Reference pictures (optional)</h3>
          <p className="text-xs text-muted-foreground">Product photos or a scene to follow. The model sees them as a guide; they are not pasted into the result.</p>
        </div>
        {brief.referenceIds.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {brief.referenceIds.map((id) => (
              <li key={id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated private media route */}
                <img src={mediaSrc(id)} alt="Reference picture" className="size-16 rounded-lg object-cover" loading="lazy" />
                <button type="button" disabled={disabled} aria-label="Remove this reference" onClick={() => { const ids = brief.referenceIds.filter((x) => x !== id); set({ referenceIds: ids, consent: ids.length ? brief.consent : null }); }} className="absolute -top-1.5 -right-1.5 rounded-full bg-background p-0.5 shadow ring-1 ring-border"><Trash2 className="size-3" /></button>
              </li>
            ))}
          </ul>
        )}
        <MediaPicker kind="image" multiple canUpload={config.canUpload} onPick={(items: MediaCard[]) => { const ids = [...new Set([...brief.referenceIds, ...items.map((m) => m._id)])].slice(0, 8); set({ referenceIds: ids, consent: ids.length ? (brief.consent ?? NO_CONSENT) : null }); }} trigger={<Button type="button" variant="outline" size="sm" disabled={disabled || brief.referenceIds.length >= 8}><ImagePlus className="size-3.5" /> {brief.referenceIds.length ? "Add more" : "Choose reference pictures"}</Button>} />
        {brief.referenceIds.length > 0 && (
          <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <p className="flex items-center gap-1.5 text-xs font-semibold"><ShieldAlert className="size-4 text-amber-600" /> People in the pictures</p>
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" disabled={disabled} checked={c.showsPeople} onChange={(e) => upd({ showsPeople: e.target.checked, attested: e.target.checked ? c.attested : false })} /> These pictures show people</label>
            {c.showsPeople && (
              <>
                <p className="text-xs text-muted-foreground">The AI may change how a person looks, but you must still have their permission. Never use a public figure, a celebrity or someone who has not agreed.</p>
                <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" disabled={disabled} checked={c.attested} onChange={(e) => upd({ attested: e.target.checked })} /> Every person shown agreed to appear in AI-made marketing images (a parent or guardian, for a minor). I can show that consent if asked.</label>
                <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" disabled={disabled} checked={c.publicFigure} onChange={(e) => upd({ publicFigure: e.target.checked })} /> One of them is a public figure or celebrity</label>
              </>
            )}
            <p className="text-[11px] text-muted-foreground">Your confirmation is saved with the project, with your name and the time taken from your sign-in, and appears in the audit log. Product photos with no people need no consent.</p>
            {errors.consent && <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{errors.consent}</p>}
          </div>
        )}
      </section>
      {!brief.referenceIds.length && <Notice tone="info">Without reference pictures the model draws everything from your words, using fictional people only.</Notice>}
      <PolicyBox brief={brief} />
    </div>
  );
}
