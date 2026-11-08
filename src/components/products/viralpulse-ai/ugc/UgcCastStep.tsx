"use client";

import { useState, type Dispatch } from "react";
import { ImagePlus, Loader2, Shuffle, ShieldCheck, Trash2, Dices } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import MediaPicker from "@/components/products/viralpulse-ai/MediaPicker";
import { Field, mediaSrc } from "@/components/products/viralpulse-ai/SmmsBits";
import { ACTOR_ARCHETYPES, AMBIENCE, CAMERA_FLAVOURS, PACING } from "@/lib/products/viralpulse-ai/ugc/styles";
import type { UgcStyle, VariationPart } from "@/lib/products/viralpulse-ai/ugc/styles";
import { actorFromArchetype, archetypeById, archetypeLabel, settingChoices, settingFrom, type WizardAction, type WizardState } from "@/lib/products/viralpulse-ai/ugc/ui-helpers";
import { formatDateTime } from "@/lib/utils";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";

const PARTS: { key: VariationPart; label: string }[] = [
  { key: "actors", label: "People" },
  { key: "setting", label: "Place" },
  { key: "camera", label: "Camera" },
  { key: "pacing", label: "Pacing" },
  { key: "ambience", label: "Sound" },
];

const withCurrent = (options: string[], current: string) => [...new Set([current, ...options].filter(Boolean))].map((o) => ({ value: o, label: o }));

export interface RefView {
  mediaId: string;
  consentBy: string;
  consentAt: string;
}

export default function UgcCastStep({
  state, dispatch, style, newSeed, references, maxReferences, referencesBlocked, attaching, canUpload, onAttach, onRemoveRef, onPickImages, error,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  style: UgcStyle;
  newSeed: () => string;
  references: RefView[];
  maxReferences: number;
  /** Why photos can't be used with this model/state, or null. */
  referencesBlocked: string | null;
  attaching: boolean;
  canUpload: boolean;
  onAttach: (mediaIds: string[]) => Promise<boolean>;
  onRemoveRef: (mediaId: string) => void;
  onPickImages: (ids: string[]) => void;
  error?: string;
}) {
  const cast = state.cast;
  const [change, setChange] = useState<Record<VariationPart, boolean>>({ actors: true, setting: true, camera: true, pacing: true, ambience: true });
  const [consent, setConsent] = useState({ own: false, notPublic: false });
  const settings = settingChoices(style);
  const settingDef = cast ? settings.find((s) => s.id === cast.setting.id) : undefined;
  const slots = Math.max(0, maxReferences - references.length);
  const pending = state.imageIds.filter((id) => !references.some((r) => r.mediaId === id));
  const changing = PARTS.filter((p) => change[p.key]).map((p) => p.key);

  if (!cast) return <p className="text-sm text-muted-foreground">Choose a style first.</p>;

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="rounded-2xl border border-border/40 bg-background/50 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => dispatch({ type: "surprise", style, seed: newSeed() })}><Dices className="size-4" /> Surprise me</Button>
          <Button type="button" variant="outline" disabled={changing.length === 0} onClick={() => dispatch({ type: "reroll", style, seed: newSeed(), change: changing })}><Shuffle className="size-4" /> Re-roll what I marked Change</Button>
          <span className="text-[11px] text-muted-foreground">{`Variation ${cast.seed.slice(-6)}`}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Keep or change each part when re-rolling">
          {PARTS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={change[p.key]}
              onClick={() => setChange((c) => ({ ...c, [p.key]: !c[p.key] }))}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${change[p.key] ? "border-primary/40 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"}`}
            >
              {`${p.label}: ${change[p.key] ? "Change" : "Keep"}`}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Every person is an invented adult. You can fine-tune anything below; the script keeps exactly these choices.</p>
      </div>

      <section aria-label="People" className="space-y-3">
        <h3 className="text-sm font-bold">{cast.actors.length === 1 ? "Who is on screen" : "Who is on screen"}</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {cast.actors.map((a, i) => {
            const arch = archetypeById(a.archetypeId);
            return (
              <div key={i} className="space-y-3 rounded-2xl border border-border/40 bg-card/60 p-3">
                <p className="text-sm font-semibold">{`Person ${i + 1}: ${a.label}`}</p>
                <Field label="Age and gender" htmlFor={`arch-${i}`}>
                  <OptionSelect id={`arch-${i}`} value={a.archetypeId} onChange={(v) => { const n = archetypeById(v); if (n) dispatch({ type: "actor", index: i, patch: actorFromArchetype(n, a) }); }} options={ACTOR_ARCHETYPES.map((x) => ({ value: x.id, label: archetypeLabel(x) }))} />
                </Field>
                <p className="text-[11px] text-muted-foreground">{a.look}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Wardrobe"><OptionSelect value={a.wardrobe} onChange={(v) => dispatch({ type: "actor", index: i, patch: { wardrobe: v } })} options={withCurrent(arch?.wardrobes ?? [], a.wardrobe)} aria-label={`Wardrobe for person ${i + 1}`} /></Field>
                  <Field label="Personality"><OptionSelect value={a.personality} onChange={(v) => dispatch({ type: "actor", index: i, patch: { personality: v } })} options={withCurrent(arch?.personalities ?? [], a.personality)} aria-label={`Personality of person ${i + 1}`} /></Field>
                  <Field label="Region and accent (AI voice)" className="sm:col-span-2"><OptionSelect value={a.accent} onChange={(v) => dispatch({ type: "actor", index: i, patch: { accent: v } })} options={withCurrent(arch?.accents ?? [], a.accent)} aria-label={`Accent of person ${i + 1}`} /></Field>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">Voices are made by the video model to match the accent you choose. Real people&apos;s voices are never copied.</p>
      </section>

      <section aria-label="Setting and camera" className="space-y-3">
        <h3 className="text-sm font-bold">Setting, camera and feel</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Place"><OptionSelect value={cast.setting.id} onChange={(v) => { const s = settingFrom(v); if (s) dispatch({ type: "castPart", patch: { setting: s } }); }} options={settings.map((s) => ({ value: s.id, label: s.label }))} aria-label="Place" /></Field>
          <Field label="Lighting"><OptionSelect value={cast.setting.lighting} onChange={(v) => dispatch({ type: "castPart", patch: { setting: { ...cast.setting, lighting: v } } })} options={withCurrent(settingDef?.lighting ?? [], cast.setting.lighting)} aria-label="Lighting" /></Field>
          <Field label="Time of day"><OptionSelect value={cast.setting.timeOfDay} onChange={(v) => dispatch({ type: "castPart", patch: { setting: { ...cast.setting, timeOfDay: v } } })} options={withCurrent(settingDef?.timeOfDay ?? [], cast.setting.timeOfDay)} aria-label="Time of day" /></Field>
          <Field label="Camera"><OptionSelect value={cast.camera} onChange={(v) => dispatch({ type: "castPart", patch: { camera: v } })} options={withCurrent([style.camera.primary, ...style.camera.alternates], cast.camera)} aria-label="Camera" /></Field>
          <Field label="Camera feel"><OptionSelect value={cast.cameraFlavour} onChange={(v) => dispatch({ type: "castPart", patch: { cameraFlavour: v } })} options={withCurrent(CAMERA_FLAVOURS, cast.cameraFlavour)} aria-label="Camera feel" /></Field>
          <Field label="Pacing"><OptionSelect value={cast.pacing} onChange={(v) => dispatch({ type: "castPart", patch: { pacing: v } })} options={withCurrent(PACING, cast.pacing)} aria-label="Pacing" /></Field>
          <Field label="Ambient sound" className="sm:col-span-2 lg:col-span-1"><OptionSelect value={cast.ambience} onChange={(v) => dispatch({ type: "castPart", patch: { ambience: v } })} options={withCurrent(AMBIENCE, cast.ambience)} aria-label="Ambient sound" /></Field>
        </div>
        <p className="text-xs text-muted-foreground">{cast.setting.description}.</p>
      </section>

      <section aria-label="Reference photos" className="space-y-3 rounded-2xl border border-border/40 bg-card/60 p-3 sm:p-4">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <h3 className="text-sm font-bold">Reference photos (optional)</h3>
            <p className="text-xs text-muted-foreground">Photos can guide how a person or product looks. <strong className="text-foreground">Only use photos of people who agreed to it</strong>, such as yourself or someone who gave written consent. Never public figures, celebrities or politicians, never anyone under 18, never AI images.</p>
          </div>
        </div>
        {referencesBlocked && <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">{referencesBlocked}</p>}

        {references.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Attached photos">
            {references.map((r) => (
              <li key={r.mediaId} className="space-y-1 rounded-xl border border-border/40 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated private media route */}
                <img src={mediaSrc(r.mediaId)} alt="Reference photo" className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
                <p className="text-[10px] leading-tight text-muted-foreground">{`Consent recorded ${formatDateTime(new Date(r.consentAt))}`}</p>
                <Button type="button" variant="ghost" size="xs" onClick={() => onRemoveRef(r.mediaId)}><Trash2 className="size-3" /> Remove</Button>
              </li>
            ))}
          </ul>
        )}

        {!referencesBlocked && pending.length > 0 && (
          <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs font-semibold">{`${pending.length} photo${pending.length > 1 ? "s" : ""} waiting for your consent`}</p>
            <ul className="flex flex-wrap gap-2">
              {pending.map((id) => (
                <li key={id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated private media route */}
                  <img src={mediaSrc(id)} alt="Photo waiting to be attached" className="size-16 rounded-lg object-cover" loading="lazy" />
                  <button type="button" aria-label="Don't use this photo" onClick={() => onPickImages(state.imageIds.filter((x) => x !== id))} className="absolute -top-1.5 -right-1.5 rounded-full bg-background p-0.5 shadow ring-1 ring-border"><Trash2 className="size-3" /></button>
                </li>
              ))}
            </ul>
            <label className="flex items-start gap-2 text-xs"><Checkbox checked={consent.own} onCheckedChange={(c) => setConsent((x) => ({ ...x, own: c === true }))} className="mt-0.5" /><span>I own {pending.length > 1 ? "these photos" : "this photo"} or have written consent from everyone in {pending.length > 1 ? "them" : "it"} to use their likeness for AI-generated video.</span></label>
            <label className="flex items-start gap-2 text-xs"><Checkbox checked={consent.notPublic} onCheckedChange={(c) => setConsent((x) => ({ ...x, notPublic: c === true }))} className="mt-0.5" /><span>Nobody in {pending.length > 1 ? "them is" : "it is"} a public figure, celebrity or politician, and nobody is under 18.</span></label>
            <Button type="button" size="sm" disabled={!consent.own || !consent.notPublic || attaching} onClick={async () => { if (await onAttach(pending.slice(0, slots || pending.length))) setConsent({ own: false, notPublic: false }); }}>
              {attaching ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />} Attach with consent
            </Button>
          </div>
        )}

        {!referencesBlocked && slots > 0 && (
          <MediaPicker kind="image" multiple canUpload={canUpload} onPick={(items: MediaCard[]) => onPickImages([...new Set([...state.imageIds, ...items.filter((m) => m.source === "upload").map((m) => m._id)])].slice(0, maxReferences))} trigger={<Button type="button" variant="outline" size="sm"><ImagePlus className="size-3.5" /> {`Choose from the media library (${slots} left)`}</Button>} />
        )}
      </section>
    </div>
  );
}
