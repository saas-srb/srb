"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  AUDIENCES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  CAMPAIGN_THEME_PRESETS,
  CTA_ACTION_TYPES,
  POPUP_TEMPLATES,
  POPUP_TRIGGER_TYPES,
  POPUP_FREQUENCIES,
  PAGE_TARGETING_MODES,
  TARGETABLE_PAGES,
  getThemePreset,
  isValidThemePreset,
  type Audience,
  type CampaignThemePreset,
  type CtaActionType,
  type PopupTemplate,
  type PopupTriggerType,
  type PopupFrequency,
  type PageTargetingMode,
} from "@/lib/offers/constants";
import { saveCampaignAction, type CampaignFormInput } from "@/app/(products)/sitecraft-ai/(protected)/offers/actions";
import type { SerializedCampaign } from "@/lib/offers/campaigns";

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CampaignForm({ campaign }: { campaign?: SerializedCampaign }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: campaign?.name ?? "",
    slug: campaign?.slug ?? "",
    campaignType: campaign?.campaignType ?? "festival",
    themePreset: campaign?.themePreset ?? "custom",
    status: campaign?.status ?? "draft",
    startDate: toLocalInput(campaign?.startDate),
    endDate: toLocalInput(campaign?.endDate),
    priority: campaign?.priority ?? 10,
    isFeatured: campaign?.isFeatured ?? false,
    targetAudience: campaign?.targetAudience ?? (["ALL"] as Audience[]),
    bannerImage: campaign?.bannerImage ?? "",
    bannerHeadline: campaign?.theme?.bannerHeadline ?? "",
    bannerSubheadline: campaign?.theme?.bannerSubheadline ?? "",
    primaryColor: campaign?.theme?.primaryColor ?? "",
    accentColor: campaign?.theme?.accentColor ?? "",
  });
  const [faqs, setFaqs] = useState(campaign?.faqs ?? []);
  const [strip, setStrip] = useState({
    enabled: campaign?.display?.strip.enabled ?? false,
    message: campaign?.display?.strip.message ?? "",
    discountText: campaign?.display?.strip.discountText ?? "",
    ctaText: campaign?.display?.strip.ctaText ?? "Claim Offer",
    ctaActionType: campaign?.display?.strip.ctaActionType ?? "url",
    ctaActionValue: campaign?.display?.strip.ctaActionValue ?? "/offers",
    showCountdown: campaign?.display?.strip.showCountdown ?? true,
    allowClose: campaign?.display?.strip.allowClose ?? true,
  });
  const [popup, setPopup] = useState({
    enabled: campaign?.display?.popup.enabled ?? false,
    template: campaign?.display?.popup.template ?? "festival",
    ctaText: campaign?.display?.popup.ctaText ?? "Claim Offer",
    ctaActionType: campaign?.display?.popup.ctaActionType ?? "url",
    ctaActionValue: campaign?.display?.popup.ctaActionValue ?? "/offers",
    showCountdown: campaign?.display?.popup.showCountdown ?? true,
    triggerType: campaign?.display?.popup.triggerType ?? "delay",
    triggerValue: campaign?.display?.popup.triggerValue ?? 10,
    frequency: campaign?.display?.popup.frequency ?? "session",
  });
  const [pageTargeting, setPageTargeting] = useState({
    mode: campaign?.display?.pageTargeting.mode ?? "all",
    pages: campaign?.display?.pageTargeting.pages ?? ([] as string[]),
  });

  function togglePage(path: string) {
    setPageTargeting((pt) => ({
      ...pt,
      pages: pt.pages.includes(path) ? pt.pages.filter((p) => p !== path) : [...pt.pages, path],
    }));
  }

  function toggleAudience(value: Audience) {
    setForm((f) => ({
      ...f,
      targetAudience: f.targetAudience.includes(value) ? f.targetAudience.filter((a) => a !== value) : [...f.targetAudience, value],
    }));
  }

  function applyPreset(key: CampaignThemePreset) {
    const preset = getThemePreset(key);
    setForm((f) => ({
      ...f,
      themePreset: key,
      primaryColor: preset.primaryColor ?? f.primaryColor,
      accentColor: preset.accentColor ?? f.accentColor,
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    start(async () => {
      const input: CampaignFormInput = {
        name: form.name,
        slug: form.slug,
        campaignType: form.campaignType as CampaignFormInput["campaignType"],
        themePreset: form.themePreset as CampaignFormInput["themePreset"],
        status: form.status as CampaignFormInput["status"],
        startDate: form.startDate ? new Date(form.startDate).toISOString() : "",
        endDate: form.endDate ? new Date(form.endDate).toISOString() : "",
        priority: Number(form.priority),
        isFeatured: form.isFeatured,
        targetAudience: form.targetAudience,
        bannerImage: form.bannerImage || undefined,
        theme: {
          bannerHeadline: form.bannerHeadline || undefined,
          bannerSubheadline: form.bannerSubheadline || undefined,
          primaryColor: form.primaryColor || undefined,
          accentColor: form.accentColor || undefined,
        },
        faqs,
        display: {
          strip: {
            enabled: strip.enabled,
            message: strip.message,
            discountText: strip.discountText,
            ctaText: strip.ctaText,
            ctaActionType: strip.ctaActionType as CtaActionType,
            ctaActionValue: strip.ctaActionValue,
            showCountdown: strip.showCountdown,
            allowClose: strip.allowClose,
          },
          popup: {
            enabled: popup.enabled,
            template: popup.template as PopupTemplate,
            ctaText: popup.ctaText,
            ctaActionType: popup.ctaActionType as CtaActionType,
            ctaActionValue: popup.ctaActionValue,
            showCountdown: popup.showCountdown,
            triggerType: popup.triggerType as PopupTriggerType,
            triggerValue: Number(popup.triggerValue),
            frequency: popup.frequency as PopupFrequency,
          },
          pageTargeting: {
            mode: pageTargeting.mode as PageTargetingMode,
            pages: pageTargeting.pages,
          },
        },
      };
      const res = await saveCampaignAction(campaign?._id ?? null, input);
      if (res?.error) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Campaign name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Diwali Tech Fest 2026" required />
          {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Slug</Label>
          <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="diwali-tech-fest-2026" required />
          {fieldErrors.slug && <p className="text-xs text-destructive">{fieldErrors.slug}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={form.campaignType} onValueChange={(v) => v && setForm({ ...form, campaignType: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CAMPAIGN_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => v && setForm({ ...form, status: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CAMPAIGN_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Only Scheduled/Active campaigns can ever go live on the public page.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Priority (higher wins ties)</Label>
          <Input type="number" min={0} max={1000} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Start date &amp; time</Label>
          <Input type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
          {fieldErrors.startDate && <p className="text-xs text-destructive">{fieldErrors.startDate}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>End date &amp; time</Label>
          <Input type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
          {fieldErrors.endDate && <p className="text-xs text-destructive">{fieldErrors.endDate}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Target audience</Label>
        <div className="flex flex-wrap gap-3">
          {AUDIENCES.map((a) => (
            <label key={a.value} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={form.targetAudience.includes(a.value)} onChange={() => toggleAudience(a.value)} />
              {a.label}
            </label>
          ))}
        </div>
        {fieldErrors.targetAudience && <p className="text-xs text-destructive">{fieldErrors.targetAudience}</p>}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} />
        Featured campaign
      </label>

      <div className="space-y-3 rounded-xl border border-border/50 p-4">
        <p className="text-sm font-semibold text-foreground">Hero &amp; theme</p>
        <div className="space-y-1.5">
          <Label>Festival theme preset</Label>
          <Select value={form.themePreset} onValueChange={(v) => isValidThemePreset(v) && applyPreset(v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CAMPAIGN_THEME_PRESETS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.emoji ? `${p.emoji} ` : ""}{p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Fills in the colors below — still fully editable after picking a preset.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Banner image URL (optional)</Label>
          <Input value={form.bannerImage} onChange={(e) => setForm({ ...form, bannerImage: e.target.value })} placeholder="https://…" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Banner headline (optional)</Label>
            <Input value={form.bannerHeadline} onChange={(e) => setForm({ ...form, bannerHeadline: e.target.value })} placeholder="Build More. Pay Less." />
          </div>
          <div className="space-y-1.5">
            <Label>Banner subheadline (optional)</Label>
            <Input value={form.bannerSubheadline} onChange={(e) => setForm({ ...form, bannerSubheadline: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Primary color (optional, hex)</Label>
            <Input value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} placeholder="#RRGGBB" />
          </div>
          <div className="space-y-1.5">
            <Label>Accent color (optional, hex)</Label>
            <Input value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} placeholder="#RRGGBB" />
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border/50 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Campaign FAQs (optional)</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setFaqs([...faqs, { question: "", answer: "" }])}>
            <Plus className="size-3.5" /> Add FAQ
          </Button>
        </div>
        {faqs.map((f, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-start">
            <Input
              placeholder="Question"
              value={f.question}
              onChange={(e) => setFaqs(faqs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
            />
            <Textarea
              placeholder="Answer"
              rows={2}
              value={f.answer}
              onChange={(e) => setFaqs(faqs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
            />
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFaqs(faqs.filter((_, j) => j !== i))}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-border/50 p-4">
        <label className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Top Strip</span>
          <input type="checkbox" checked={strip.enabled} onChange={(e) => setStrip({ ...strip, enabled: e.target.checked })} />
        </label>
        {strip.enabled && (
          <>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Input value={strip.message} onChange={(e) => setStrip({ ...strip, message: e.target.value })} placeholder="Build Your Next Product at Festival Pricing" />
              {fieldErrors.stripMessage && <p className="text-xs text-destructive">{fieldErrors.stripMessage}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Discount text</Label>
                <Input value={strip.discountText} onChange={(e) => setStrip({ ...strip, discountText: e.target.value })} placeholder="UP TO 90% OFF" />
              </div>
              <div className="space-y-1.5">
                <Label>CTA text</Label>
                <Input value={strip.ctaText} onChange={(e) => setStrip({ ...strip, ctaText: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>CTA action</Label>
                <Select value={strip.ctaActionType} onValueChange={(v) => v && setStrip({ ...strip, ctaActionType: v as typeof strip.ctaActionType })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CTA_ACTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {strip.ctaActionType === "url" && (
                <div className="space-y-1.5">
                  <Label>CTA URL</Label>
                  <Input value={strip.ctaActionValue} onChange={(e) => setStrip({ ...strip, ctaActionValue: e.target.value })} placeholder="/offers" />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={strip.showCountdown} onChange={(e) => setStrip({ ...strip, showCountdown: e.target.checked })} />
                Show countdown
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={strip.allowClose} onChange={(e) => setStrip({ ...strip, allowClose: e.target.checked })} />
                Closable
              </label>
            </div>
          </>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border/50 p-4">
        <label className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Popup</span>
          <input type="checkbox" checked={popup.enabled} onChange={(e) => setPopup({ ...popup, enabled: e.target.checked })} />
        </label>
        {popup.enabled && (
          <>
            <p className="text-xs text-muted-foreground">
              The popup&apos;s title/discount is derived from the campaign&apos;s real offers (Deal of the Day, or the best match for the page a
              visitor is on) — only the framing below is configured here.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Template</Label>
                <Select value={popup.template} onValueChange={(v) => v && setPopup({ ...popup, template: v as typeof popup.template })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POPUP_TEMPLATES.map((t) => <SelectItem key={t.value} value={t.value}>{t.emoji} {t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>CTA text</Label>
                <Input value={popup.ctaText} onChange={(e) => setPopup({ ...popup, ctaText: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>CTA action</Label>
                <Select value={popup.ctaActionType} onValueChange={(v) => v && setPopup({ ...popup, ctaActionType: v as typeof popup.ctaActionType })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CTA_ACTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {popup.ctaActionType === "url" && (
                <div className="space-y-1.5">
                  <Label>CTA URL</Label>
                  <Input value={popup.ctaActionValue} onChange={(e) => setPopup({ ...popup, ctaActionValue: e.target.value })} placeholder="/offers" />
                </div>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Trigger</Label>
                <Select value={popup.triggerType} onValueChange={(v) => v && setPopup({ ...popup, triggerType: v as typeof popup.triggerType })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POPUP_TRIGGER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {popup.triggerType === "delay" && (
                <div className="space-y-1.5">
                  <Label>Delay (seconds)</Label>
                  <Input type="number" min={0} max={300} value={popup.triggerValue} onChange={(e) => setPopup({ ...popup, triggerValue: Number(e.target.value) })} />
                </div>
              )}
              {popup.triggerType === "scroll" && (
                <div className="space-y-1.5">
                  <Label>Scroll depth (%)</Label>
                  <Input type="number" min={1} max={100} value={popup.triggerValue} onChange={(e) => setPopup({ ...popup, triggerValue: Number(e.target.value) })} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={popup.frequency} onValueChange={(v) => v && setPopup({ ...popup, frequency: v as typeof popup.frequency })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POPUP_FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={popup.showCountdown} onChange={(e) => setPopup({ ...popup, showCountdown: e.target.checked })} />
              Show countdown
            </label>
          </>
        )}
      </div>

      {(strip.enabled || popup.enabled) && (
        <div className="space-y-3 rounded-xl border border-border/50 p-4">
          <p className="text-sm font-semibold text-foreground">Page targeting (Strip &amp; Popup)</p>
          <Select value={pageTargeting.mode} onValueChange={(v) => v && setPageTargeting({ ...pageTargeting, mode: v as typeof pageTargeting.mode })}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_TARGETING_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {pageTargeting.mode === "selected" && (
            <div className="flex flex-wrap gap-3">
              {TARGETABLE_PAGES.map((p) => (
                <label key={p.path} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={pageTargeting.pages.includes(p.path)} onChange={() => togglePage(p.path)} />
                  {p.label}
                </label>
              ))}
            </div>
          )}
          {fieldErrors.pageTargeting && <p className="text-xs text-destructive">{fieldErrors.pageTargeting}</p>}
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : campaign ? "Save changes" : "Create campaign"}
      </Button>
    </form>
  );
}
