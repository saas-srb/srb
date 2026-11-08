"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import { Field } from "@/components/products/viralpulse-ai/SmmsBits";
import { Notice } from "@/components/products/viralpulse-ai/SmmsUi";
import { SizePicker } from "@/components/products/viralpulse-ai/studio/FormatGallery";
import type { StudioConfig } from "@/components/products/viralpulse-ai/studio/config";
import { goalById, SPECS, specByKey } from "@/lib/products/viralpulse-ai/images/specs";
import { checkOverlayText } from "@/lib/products/viralpulse-ai/images/policy";
import { policyOf, type Errors } from "@/lib/products/viralpulse-ai/images/wizard";
import { TEXT_POSITIONS, type Brief } from "@/lib/products/viralpulse-ai/images/types";
import { LANGUAGES } from "@/lib/products/viralpulse-ai/constants";
import { cn } from "@/lib/utils";

/** Look presets. Each only fills the "Style and mood" text; the swatch is the palette the words describe, not a sample picture. */
export const MOODS: { id: string; label: string; text: string; swatch: [string, string, string] }[] = [
  { id: "clean", label: "Clean and minimal", text: "Clean, minimal, plenty of white space, soft even light", swatch: ["#f8fafc", "#e2e8f0", "#94a3b8"] },
  { id: "warm", label: "Warm and natural", text: "Warm natural daylight, friendly, authentic, earthy tones", swatch: ["#fde68a", "#f59e0b", "#92400e"] },
  { id: "bold", label: "Bold and high contrast", text: "Bold, high contrast, saturated colours, strong focal subject", swatch: ["#111827", "#ef4444", "#facc15"] },
  { id: "premium", label: "Premium and dark", text: "Premium, dark moody background, soft rim light, elegant and uncluttered", swatch: ["#0f172a", "#334155", "#d4af37"] },
  { id: "playful", label: "Playful and colourful", text: "Playful, bright colours, fun shapes, cheerful energy", swatch: ["#f472b6", "#38bdf8", "#facc15"] },
  { id: "festive", label: "Festive", text: "Festive, warm lamps and diyas glow, rich colours, celebratory mood", swatch: ["#7c2d12", "#f97316", "#fde047"] },
  { id: "editorial", label: "Editorial", text: "Editorial magazine look, considered composition, natural textures, muted palette", swatch: ["#e7e5e4", "#a8a29e", "#44403c"] },
  { id: "flat", label: "Flat illustration", text: "Flat vector illustration, simple geometric shapes, limited palette", swatch: ["#a5b4fc", "#6366f1", "#312e81"] },
];

export function PolicyBox({ brief }: { brief: Brief }) {
  const p = policyOf(brief);
  if (!p.blocked.length && !p.flagged.length) return null;
  return (
    <div role="status" aria-live="polite" className="space-y-1.5">
      {p.blocked.map((f) => <Notice key={f.code} tone="error">{f.message}</Notice>)}
      {p.flagged.map((f) => <Notice key={f.code} tone="warn">{f.message}</Notice>)}
    </div>
  );
}

export function briefContext(b: Brief, config: StudioConfig) {
  const goal = goalById(b.goalId);
  return () => ({ goal: goal?.label ?? "", product: b.product, subject: b.subject, style: b.style, colours: b.colours, platform: b.specKeys.map((k) => specByKey(k)?.group).filter(Boolean).join(", "), language: b.language, kitVoice: config.kit.voice, overlayText: b.overlayText.join("\n"), textPosition: b.textPosition, prompt: b.subject, name: b.name }) as Record<string, unknown>;
}

export default function ImageBriefStep({ brief, set, errors, config, quick, disabled }: { brief: Brief; set: (patch: Partial<Brief>) => void; errors: Errors; config: StudioConfig; quick: boolean; disabled: boolean }) {
  const goal = goalById(brief.goalId)!;
  const ctx = briefContext(brief, config);
  const ai = { getContext: ctx, aiDisabled: disabled, disabled };
  const kitColours = Object.values(config.kit.colours).filter(Boolean);
  const checks = brief.overlayText.map((t) => checkOverlayText(t));
  const setSlide = (i: number, v: string) => set({ overlayText: brief.overlayText.map((x, j) => (j === i ? v : x)) });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <AiField {...ai} fieldKey="image.goal" label="Project name (optional)" id="img-name" className="sm:col-span-2" hint="Only for finding it later, for example: Diwali offer, Instagram." value={brief.name} maxLength={160} onChange={(x) => set({ name: String(x) })} />
        {quick && (
          <Field label="Size" className="sm:col-span-2" hint={errors.specKeys ?? "Pick the platform and shape. Sizes were checked on the date shown in the Create flow."}>
            <OptionSelect value={brief.specKeys[0] ?? ""} onChange={(v) => set({ specKeys: [v] })} options={SPECS.map((s) => ({ value: s.key, label: `${s.group}: ${s.label} (${s.width}x${s.height})` }))} aria-label="Size" disabled={disabled} />
          </Field>
        )}
        <AiField {...ai} fieldKey="image.subject" label="What the picture shows" id="img-subject" as="textarea" rows={4} className="sm:col-span-2" hint={errors.subject ?? "Fictional people only. No real person's name, no other company's logo."} placeholder="A tailor measuring fabric in a bright, tidy shop, shot from the front" value={brief.subject} maxLength={1200} onChange={(x) => set({ subject: String(x) })} />
        {!quick && <AiField {...ai} fieldKey="image.product" label="Product or service" id="img-product" hint="The AI button only tidies what you wrote." value={brief.product} maxLength={400} onChange={(x) => set({ product: String(x) })} />}
        {!quick && <AiField {...ai} fieldKey="image.colours" label="Colours" id="img-colours" placeholder="Deep blue and saffron" value={brief.colours} maxLength={200} onChange={(x) => set({ colours: String(x) })} />}
      </div>

      <section aria-label="Look and mood" className="space-y-2">
        <h3 className="text-sm font-bold">Look and mood</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MOODS.map((m) => {
            const on = brief.style === m.text;
            return (
              <button key={m.id} type="button" disabled={disabled} aria-pressed={on} onClick={() => set({ style: on ? "" : m.text })} className={cn("flex flex-col gap-1.5 rounded-xl border p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40", on ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border/60 hover:border-primary/40")}>
                <span aria-hidden className="flex h-5 overflow-hidden rounded-md">{m.swatch.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</span>
                <span className="text-xs font-semibold">{m.label}</span>
              </button>
            );
          })}
        </div>
        <AiField {...ai} fieldKey="image.style" label="Style and mood" id="img-style" hint="Pick a preset or write your own." placeholder="Warm natural light, clean, modern" value={brief.style} maxLength={400} onChange={(x) => set({ style: String(x) })} />
        {!quick && kitColours.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">Brand colours: {kitColours.map((c) => <span key={c} className="inline-flex items-center gap-1"><span className="size-3 rounded-full border border-border" style={{ background: c }} />{c}</span>)}<span>(applied automatically when the brand kit is on)</span></p>
        )}
      </section>

      <section aria-label="Text on the picture" className="space-y-3 rounded-2xl border border-border/40 bg-background/50 p-3">
        <div>
          <h3 className="text-sm font-bold">Text on the picture</h3>
          <p className="text-xs text-muted-foreground">The model never draws words. The app prints your exact text with a bundled font (English or Hindi), so prices, dates and names are always spelled as you wrote them.</p>
        </div>
        {goal.slides ? (
          <div className="space-y-2">
            {errors.overlaySlides && <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{errors.overlaySlides}</p>}
            {brief.overlayText.map((t, i) => (
              <AiField key={i} {...ai} fieldKey="image.overlayText" label={`Slide ${i + 1}`} id={`img-ot-${i}`} value={t} maxLength={160} hint={errors[`overlay${i}`] ?? checks[i]?.message ?? undefined} onChange={(x) => setSlide(i, String(x))} />
            ))}
            <div className="flex gap-2">
              <Button type="button" size="xs" variant="outline" disabled={disabled || brief.overlayText.length >= goal.slides.max} onClick={() => set({ overlayText: [...brief.overlayText, ""], variants: brief.overlayText.length + 1 })}><Plus className="size-3" /> Add slide</Button>
              <Button type="button" size="xs" variant="outline" disabled={disabled || brief.overlayText.length <= goal.slides.min} onClick={() => set({ overlayText: brief.overlayText.slice(0, -1), variants: brief.overlayText.length - 1 })}><X className="size-3" /> Remove last</Button>
            </div>
          </div>
        ) : (
          <AiField {...ai} fieldKey="image.overlayText" label="Exact text (optional)" id="img-ot" as="textarea" rows={3} value={brief.overlayText[0] ?? ""} maxLength={160} hint={errors.overlay0 ?? checks[0]?.message ?? "Keep prices and dates exactly right. The AI button only tidies your own words."} onChange={(x) => set({ overlayText: [String(x)] })} />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Text position"><OptionSelect value={brief.textPosition} onChange={(v) => set({ textPosition: v as Brief["textPosition"] })} options={TEXT_POSITIONS.map((p) => ({ value: p.value, label: p.label }))} aria-label="Text position" disabled={disabled} /></Field>
          <Field label="Language of the text"><OptionSelect value={brief.language} onChange={(v) => set({ language: v })} options={LANGUAGES.map((l) => ({ value: l, label: l }))} aria-label="Language" disabled={disabled} /></Field>
        </div>
      </section>

      <AiField {...ai} fieldKey="image.negative" label="Leave out (optional)" id="img-neg" placeholder="crowds, clutter, bright red" hint="Things the picture must not contain, comma separated." value={brief.negative} maxLength={400} onChange={(x) => set({ negative: String(x) })} />

      {!quick && <SizePicker value={brief.specKeys} onChange={(k) => set({ specKeys: k })} error={errors.specKeys} />}
      {errors.policy && <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">{errors.policy}</p>}
      <PolicyBox brief={brief} />
    </div>
  );
}
