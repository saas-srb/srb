"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ImageIcon, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OptionSelect from "@/components/products/playbook-ai/OptionSelect";
import AiField from "@/components/products/viralpulse-ai/shared/AiField";
import MediaPicker from "@/components/products/viralpulse-ai/MediaPicker";
import { Field, MediaThumb } from "@/components/products/viralpulse-ai/SmmsBits";
import { SectionCard, Notice } from "@/components/products/viralpulse-ai/SmmsUi";
import { saveImageSettingsAction, saveKitAction } from "@/app/(products)/viralpulse-ai/(protected)/image-studio/actions";
import { LOGO_PLACEMENTS, type BrandKit } from "@/lib/products/viralpulse-ai/images/types";
import type { ImageSettings } from "@/lib/products/viralpulse-ai/images/limits";
import { GEMINI_IMAGE_PRICES } from "@/lib/products/viralpulse-ai/images/pricing";
import type { MediaCard } from "@/lib/products/viralpulse-ai/media";

const COLOUR_KEYS = [["primary", "Primary"], ["secondary", "Secondary"], ["accent", "Accent"], ["text", "Text on pictures"]] as const;

export default function StudioKit({ kit: initial, logo: initialLogo, settings: initialSettings, canEdit, geminiConnected }: { kit: BrandKit; logo: MediaCard | null; settings: ImageSettings; canEdit: boolean; geminiConnected: boolean }) {
  const [kit, setKit] = useState(initial);
  const [logo, setLogo] = useState(initialLogo);
  const [s, setS] = useState(initialSettings);
  const [pending, start] = useTransition();
  const ctx = () => ({ voice: kit.voice, dos: kit.dos.join("\n"), donts: kit.donts.join("\n") });
  const num = (v: string, d: number) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);

  return (
    <div className="space-y-4">
      <SectionCard title="Brand kit" description="Used by every Image Studio project that has the kit switched on. Stored for your company only.">
        {!canEdit && <Notice tone="info">You can see the kit. Changing it needs permission to manage settings.</Notice>}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="Logo" hint="A PNG with a transparent background works best. Upload it to the library first, or pick one there.">
              <div className="flex items-center gap-3">
                {logo ? <MediaThumb media={logo} className="size-16 bg-white" /> : <span className="text-xs text-muted-foreground">No logo</span>}
                {canEdit && <MediaPicker kind="image" multiple={false} canUpload onPick={(x) => { setLogo(x[0] ?? null); setKit((k) => ({ ...k, logoMediaId: x[0]?._id ?? null })); }} trigger={<Button type="button" size="sm" variant="outline"><ImageIcon className="size-3.5" /> {logo ? "Change" : "Choose logo"}</Button>} />}
                {canEdit && logo && <Button type="button" size="xs" variant="ghost" onClick={() => { setLogo(null); setKit((k) => ({ ...k, logoMediaId: null, applyLogo: false })); }}>Remove</Button>}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Logo placement"><OptionSelect value={kit.logoPlacement} disabled={!canEdit} onChange={(v) => setKit((k) => ({ ...k, logoPlacement: v as BrandKit["logoPlacement"] }))} options={LOGO_PLACEMENTS.map((p) => ({ value: p.value, label: p.label }))} aria-label="Logo placement" /></Field>
              <Field label="Logo width (% of picture)"><Input type="number" min={5} max={40} disabled={!canEdit} value={Math.round(kit.logoScale * 100)} onChange={(e) => setKit((k) => ({ ...k, logoScale: num(e.target.value, 14) / 100 }))} aria-label="Logo width percent" /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canEdit || !kit.logoMediaId} checked={kit.applyLogo} onChange={(e) => setKit((k) => ({ ...k, applyLogo: e.target.checked }))} /> Put the logo on exports by default</label>
            <div className="grid grid-cols-2 gap-3">
              {COLOUR_KEYS.map(([key, label]) => (
                <Field key={key} label={label}>
                  <div className="flex items-center gap-2">
                    <input type="color" aria-label={`${label} colour`} disabled={!canEdit} value={kit.colours[key] || "#000000"} onChange={(e) => setKit((k) => ({ ...k, colours: { ...k.colours, [key]: e.target.value } }))} className="h-9 w-10 cursor-pointer rounded border border-border bg-transparent" />
                    <Input value={kit.colours[key]} disabled={!canEdit} placeholder="#rrggbb" maxLength={7} onChange={(e) => setKit((k) => ({ ...k, colours: { ...k.colours, [key]: e.target.value } }))} aria-label={`${label} hex`} />
                  </div>
                </Field>
              ))}
            </div>
            <Field label="Font for text on pictures" hint="Only fonts bundled with the app can be drawn, so spelling and layout are identical everywhere: Noto Sans (English) and Noto Sans Devanagari (Hindi).">
              <OptionSelect value={kit.fontWeight} disabled={!canEdit} onChange={(v) => setKit((k) => ({ ...k, fontWeight: v as BrandKit["fontWeight"] }))} options={[{ value: "bold", label: "Bold" }, { value: "regular", label: "Regular" }]} aria-label="Font weight" />
            </Field>
          </div>
          <div className="space-y-3">
            <AiField fieldKey="image.kitVoice" label="Brand voice" id="kit-voice" as="textarea" rows={3} value={kit.voice} disabled={!canEdit} aiDisabled={!canEdit} onChange={(v) => setKit((k) => ({ ...k, voice: String(v) }))} getContext={ctx} placeholder="Friendly, practical, no jargon" />
            <AiField fieldKey="image.kitDos" label="Always do" id="kit-dos" as="list" value={kit.dos} disabled={!canEdit} aiDisabled={!canEdit} onChange={(v) => setKit((k) => ({ ...k, dos: Array.isArray(v) ? v : String(v).split("\n") }))} getContext={ctx} hint="One rule per line." />
            <AiField fieldKey="image.kitDonts" label="Never do" id="kit-donts" as="list" value={kit.donts} disabled={!canEdit} aiDisabled={!canEdit} onChange={(v) => setKit((k) => ({ ...k, donts: Array.isArray(v) ? v : String(v).split("\n") }))} getContext={ctx} hint="One rule per line." />
            <AiField fieldKey="campaign.cta" label="Default call to action" id="kit-cta" value={kit.defaultCta} disabled={!canEdit} aiDisabled={!canEdit} onChange={(v) => setKit((k) => ({ ...k, defaultCta: String(v) }))} getContext={() => ({ objective: "", platforms: [] })} />
          </div>
        </div>
        {canEdit && (
          <Button type="button" className="mt-4" disabled={pending} onClick={() => start(async () => { const r = await saveKitAction(kit); if (!r.ok) return void toast.error(r.error); setKit(r.kit); toast.success("Brand kit saved."); })}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save brand kit</Button>
        )}
      </SectionCard>

      <SectionCard title="Limits and cost" description="Per-company guard rails. A request estimated above the approval limit waits for a manager.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Daily spend limit (USD)" hint="0 switches image generation off."><Input type="number" min={0} step="0.5" disabled={!canEdit} value={s.dailySpendCapUsd} onChange={(e) => setS((x) => ({ ...x, dailySpendCapUsd: num(e.target.value, x.dailySpendCapUsd) }))} /></Field>
          <Field label="Approval above (USD)" hint="0 = every request needs a manager."><Input type="number" min={0} step="0.5" disabled={!canEdit} value={s.approvalThresholdUsd} onChange={(e) => setS((x) => ({ ...x, approvalThresholdUsd: num(e.target.value, x.approvalThresholdUsd) }))} /></Field>
          <Field label="Pictures per minute, per person"><Input type="number" min={1} max={60} disabled={!canEdit} value={s.perUserPerMinute} onChange={(e) => setS((x) => ({ ...x, perUserPerMinute: num(e.target.value, x.perUserPerMinute) }))} /></Field>
          <Field label="Most options at once"><Input type="number" min={1} max={4} disabled={!canEdit} value={s.maxVariants} onChange={(e) => setS((x) => ({ ...x, maxVariants: num(e.target.value, x.maxVariants) }))} /></Field>
          <Field label="Default model"><OptionSelect value={s.defaultProvider} disabled={!canEdit} onChange={(v) => setS((x) => ({ ...x, defaultProvider: v as ImageSettings["defaultProvider"] }))} options={[{ value: "openai", label: "OpenAI" }, ...(geminiConnected ? [{ value: "gemini", label: "Gemini" }] : [])]} aria-label="Default model" /></Field>
          {geminiConnected && <Field label="Gemini image model"><OptionSelect value={s.geminiModel} disabled={!canEdit} onChange={(v) => setS((x) => ({ ...x, geminiModel: v }))} options={Object.keys(GEMINI_IMAGE_PRICES).map((m) => ({ value: m, label: m }))} aria-label="Gemini model" /></Field>}
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" disabled={!canEdit} checked={s.badgeForPeopleDefault} onChange={(e) => setS((x) => ({ ...x, badgeForPeopleDefault: e.target.checked }))} /> AI badge on by default for people pictures</label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">OpenAI image prices and quality are edited in Settings &gt; AI. Gemini bills per picture; the built-in table (read 2026-11-01) is used unless you override it.</p>
        {canEdit && <Button type="button" className="mt-3" disabled={pending} onClick={() => start(async () => { const r = await saveImageSettingsAction(s); if (!r.ok) return void toast.error(r.error); setS(r.settings); toast.success("Limits saved."); })}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save limits</Button>}
      </SectionCard>
    </div>
  );
}
