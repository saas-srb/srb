"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import ServicePicker from "@/components/products/dealflow-ai/offers/ServicePicker";
import OfferCard from "@/components/offers/OfferCard";
import { nowMs } from "@/lib/offers/live";
import { AUDIENCES, AUDIENCE_PRESETS, OFFER_STATUSES, PRICING_MODES, DEFAULT_CURRENCY, OFFER_TYPES, PRICING_UNITS, OFFER_SEGMENTS, LIMIT_KINDS, type Audience, type PricingMode, type OfferType, type PricingUnit, type OfferSegment, type LimitKind } from "@/lib/offers/constants";
import type { CategorySlug } from "@/lib/categories";
import { saveOfferAction } from "@/app/(products)/sitecraft-ai/(protected)/offers/[id]/offers/actions";
import type { SerializedOffer } from "@/lib/offers/offers";

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function OfferForm({ campaignId, offer }: { campaignId: string; offer?: SerializedOffer }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: offer?.title ?? "",
    description: offer?.description ?? "",
    badgeText: offer?.badgeText ?? "",
    category: (offer?.category ?? "") as CategorySlug | "",
    subService: offer?.subService ?? "",
    audience: offer?.audience ?? (["ALL"] as Audience[]),
    status: offer?.status ?? "draft",
    validFrom: toLocalInput(offer?.validFrom),
    validUntil: toLocalInput(offer?.validUntil),
    priority: offer?.priority ?? 10,
    isFeatured: offer?.isFeatured ?? false,
    isDealOfTheDay: offer?.isDealOfTheDay ?? false,
    isFlashDeal: offer?.isFlashDeal ?? false,
    pricingMode: offer?.pricing.mode ?? ("custom_quote" as PricingMode),
    originalPrice: offer?.pricing.originalPrice ?? "",
    currency: offer?.pricing.currency ?? DEFAULT_CURRENCY,
    percentage: offer?.pricing.percentage ?? "",
    flatDiscountAmount: offer?.pricing.flatDiscountAmount ?? "",
    maxDiscountCap: offer?.pricing.maxDiscountCap ?? "",
    startingPriceLabel: offer?.pricing.startingPriceLabel ?? "",
    claimLimit: offer?.claimLimit ?? "",
    offerTypes: (offer?.offerTypes ?? []) as OfferType[],
    unit: (offer?.pricing.unit ?? "fixed") as PricingUnit,
    segment: (offer?.segment ?? "any") as OfferSegment,
    limitKind: (offer?.limitKind ?? "slots") as LimitKind,
    ctaText: offer?.ctaText ?? "",
    linkedKind: (offer?.linked?.kind ?? "service") as "course" | "service" | "product" | "program",
    linkedLabel: offer?.linked?.label ?? "",
    linkedHref: offer?.linked?.href ?? "",
  });
  const [benefits, setBenefits] = useState<string[]>(offer?.benefits ?? []);
  const [eligibility, setEligibility] = useState<string[]>(offer?.eligibility ?? []);

  function toggleAudience(value: Audience) {
    setForm((f) => ({ ...f, audience: f.audience.includes(value) ? f.audience.filter((a) => a !== value) : [...f.audience, value] }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    start(async () => {
      const res = await saveOfferAction(campaignId, offer?._id ?? null, {
        title: form.title,
        description: form.description || undefined,
        badgeText: form.badgeText || undefined,
        category: form.category as CategorySlug,
        subService: form.subService,
        audience: form.audience,
        status: form.status,
        validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : "",
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : "",
        priority: Number(form.priority),
        isFeatured: form.isFeatured,
        isDealOfTheDay: form.isDealOfTheDay,
        isFlashDeal: form.isFlashDeal,
        benefits,
        eligibility,
        claimLimit: form.claimLimit === "" ? null : Number(form.claimLimit),
        offerTypes: form.offerTypes,
        segment: form.segment,
        limitKind: form.limitKind,
        ctaText: form.ctaText || undefined,
        linked: form.linkedLabel || form.linkedHref ? { kind: form.linkedKind, label: form.linkedLabel, href: form.linkedHref } : null,
        pricing: {
          unit: form.unit,
          mode: form.pricingMode,
          originalPrice: form.originalPrice === "" ? undefined : Number(form.originalPrice),
          currency: form.currency || undefined,
          percentage: form.percentage === "" ? undefined : Number(form.percentage),
          flatDiscountAmount: form.flatDiscountAmount === "" ? undefined : Number(form.flatDiscountAmount),
          maxDiscountCap: form.maxDiscountCap === "" ? undefined : Number(form.maxDiscountCap),
          startingPriceLabel: form.startingPriceLabel || undefined,
        },
      });
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

      <div className="space-y-1.5">
        <Label>Offer title</Label>
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Web App Development — Festival Special" required />
        {fieldErrors.title && <p className="text-xs text-destructive">{fieldErrors.title}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Short description (optional)</Label>
        <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>

      <div className="space-y-1.5">
        <Label>Badge text (optional — auto-generated from pricing if left blank)</Label>
        <Input value={form.badgeText} onChange={(e) => setForm({ ...form, badgeText: e.target.value })} placeholder="FESTIVAL OFFER" />
      </div>

      <ServicePicker
        category={form.category}
        subService={form.subService}
        onCategoryChange={(v) => setForm({ ...form, category: v, subService: "" })}
        onSubServiceChange={(v) => setForm({ ...form, subService: v })}
        allowAllSubService
      />
      {fieldErrors.category && <p className="text-xs text-destructive">{fieldErrors.category}</p>}
      {fieldErrors.subService && <p className="text-xs text-destructive">{fieldErrors.subService}</p>}

      <div className="space-y-3 rounded-xl border border-border/50 p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Offer type (marketplace tags)</p>
          <p className="text-xs text-muted-foreground">Pick every type that fits — visitors filter the marketplace by these. A flash + student + course offer is fine.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {OFFER_TYPES.map((t) => {
            const active = form.offerTypes.includes(t.value);
            return (
              <button
                key={t.value}
                type="button"
                title={t.blurb}
                onClick={() => setForm((f) => ({ ...f, offerTypes: active ? f.offerTypes.filter((x) => x !== t.value) : [...f.offerTypes, t.value] }))}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-foreground hover:border-primary hover:text-primary"}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Who can claim</Label>
            <Select value={form.segment} onValueChange={(v) => v && setForm({ ...form, segment: v as OfferSegment })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{OFFER_SEGMENTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">First-time offers reject emails that already have an account or claim; existing-customer offers require a signed-in match. Enforced on the server.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Button text (optional)</Label>
            <Input value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} placeholder="Claim Offer / Enroll Now / Hire Now" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Related item type</Label>
            <Select value={form.linkedKind} onValueChange={(v) => v && setForm({ ...form, linkedKind: v as typeof form.linkedKind })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="course">DealFlow course</SelectItem>
                <SelectItem value="program">Program</SelectItem>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="product">Product</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Related item name</Label>
            <Input value={form.linkedLabel} onChange={(e) => setForm({ ...form, linkedLabel: e.target.value })} placeholder="Full-Stack MERN Bootcamp" />
            {fieldErrors.linkedLabel && <p className="text-xs text-destructive">{fieldErrors.linkedLabel}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Link</Label>
            <Input value={form.linkedHref} onChange={(e) => setForm({ ...form, linkedHref: e.target.value })} placeholder="/industrial-training" />
            {fieldErrors.linkedHref && <p className="text-xs text-destructive">{fieldErrors.linkedHref}</p>}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border/50 p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Target audience</p>
          <p className="text-xs text-muted-foreground">Who should see this offer on the public page. Pick a preset, then fine-tune below.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {AUDIENCE_PRESETS.map((preset) => {
            const active = preset.audiences.length === form.audience.length && preset.audiences.every((a) => form.audience.includes(a));
            return (
              <button
                key={preset.key}
                type="button"
                title={preset.hint}
                onClick={() => setForm((f) => ({ ...f, audience: preset.audiences }))}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border/60 text-foreground hover:border-primary hover:text-primary"}`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3">
          {AUDIENCES.map((a) => (
            <label key={a.value} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={form.audience.includes(a.value)} onChange={() => toggleAudience(a.value)} />
              {a.label}
            </label>
          ))}
        </div>
        {fieldErrors.audience && <p className="text-xs text-destructive">{fieldErrors.audience}</p>}
      </div>

      <div className="space-y-3 rounded-xl border border-border/50 p-4">
        <p className="text-sm font-semibold text-foreground">Pricing</p>
        <div className="space-y-1.5">
          <Label>Pricing mode</Label>
          <Select value={form.pricingMode} onValueChange={(v) => v && setForm({ ...form, pricingMode: v as PricingMode })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRICING_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Price is</Label>
          <Select value={form.unit} onValueChange={(v) => v && setForm({ ...form, unit: v as PricingUnit })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{PRICING_UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">For hourly offers enter the regular hourly rate as the original price — the card shows regular vs offer rate per hour.</p>
        </div>

        {form.pricingMode !== "custom_quote" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Original price</Label>
              <Input type="number" min={0} value={form.originalPrice} onChange={(e) => setForm({ ...form, originalPrice: e.target.value })} />
              {fieldErrors.originalPrice && <p className="text-xs text-destructive">{fieldErrors.originalPrice}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
            </div>
            {form.pricingMode === "percentage" && (
              <div className="space-y-1.5">
                <Label>Percentage off (1–100)</Label>
                <Input type="number" min={1} max={100} value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} />
                {fieldErrors.percentage && <p className="text-xs text-destructive">{fieldErrors.percentage}</p>}
              </div>
            )}
            {form.pricingMode === "flat" && (
              <div className="space-y-1.5">
                <Label>Flat amount off</Label>
                <Input type="number" min={0} value={form.flatDiscountAmount} onChange={(e) => setForm({ ...form, flatDiscountAmount: e.target.value })} />
                {fieldErrors.flatDiscountAmount && <p className="text-xs text-destructive">{fieldErrors.flatDiscountAmount}</p>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Max discount cap (optional)</Label>
              <Input type="number" min={0} value={form.maxDiscountCap} onChange={(e) => setForm({ ...form, maxDiscountCap: e.target.value })} />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Starting price label (optional, e.g. &quot;From $15/hr&quot;)</Label>
            <Input value={form.startingPriceLabel} onChange={(e) => setForm({ ...form, startingPriceLabel: e.target.value })} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Valid from</Label>
          <Input type="datetime-local" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} required />
          {fieldErrors.validFrom && <p className="text-xs text-destructive">{fieldErrors.validFrom}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Valid until</Label>
          <Input type="datetime-local" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} required />
          {fieldErrors.validUntil && <p className="text-xs text-destructive">{fieldErrors.validUntil}</p>}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border/50 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Benefits (optional)</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setBenefits([...benefits, ""])}>
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
        {benefits.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={b} onChange={(e) => setBenefits(benefits.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Live Projects" />
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setBenefits(benefits.filter((_, j) => j !== i))}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-border/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Eligibility (optional)</p>
            <p className="text-xs text-muted-foreground">Plain-language conditions shown on the card details, e.g. &quot;Final-year students only&quot;.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setEligibility([...eligibility, ""])}>
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
        {eligibility.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={b} onChange={(e) => setEligibility(eligibility.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Registered companies only" />
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setEligibility(eligibility.filter((_, j) => j !== i))}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 rounded-xl border border-border/50 p-4">
        <Label>Claim limit (optional)</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input type="number" min={1} value={form.claimLimit} onChange={(e) => setForm({ ...form, claimLimit: e.target.value })} placeholder="Leave empty for unlimited" />
          <Select value={form.limitKind} onValueChange={(v) => v && setForm({ ...form, limitKind: v as LimitKind })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{LIMIT_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">Shows a real &quot;X of Y claimed&quot; progress bar on the public page and stops new claims once reached. Leave empty and no scarcity is ever shown.</p>
        {fieldErrors.claimLimit && <p className="text-xs text-destructive">{fieldErrors.claimLimit}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => v && setForm({ ...form, status: v as typeof form.status })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OFFER_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Input type="number" min={0} max={1000} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} />
          Featured offer
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isDealOfTheDay} onChange={(e) => setForm({ ...form, isDealOfTheDay: e.target.checked })} />
          Deal of the Day (replaces any other offer set for this campaign)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isFlashDeal} onChange={(e) => setForm({ ...form, isFlashDeal: e.target.checked })} />
          Flash deal
        </label>
      </div>

      {form.title && form.category && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Live preview — how visitors will see it</p>
          <div className="max-w-sm">
            <OfferCard
              offer={{
                _id: offer?._id ?? "preview",
                campaignId,
                title: form.title,
                description: form.description || undefined,
                badgeText: form.badgeText || undefined,
                category: form.category as CategorySlug,
                subService: form.subService || "all",
                audience: form.audience,
                pricing: {
                  mode: form.pricingMode,
                  originalPrice: form.originalPrice === "" ? undefined : Number(form.originalPrice),
                  currency: form.currency || undefined,
                  percentage: form.percentage === "" ? undefined : Number(form.percentage),
                  flatDiscountAmount: form.flatDiscountAmount === "" ? undefined : Number(form.flatDiscountAmount),
                  startingPriceLabel: form.startingPriceLabel || undefined,
                  unit: form.unit,
                },
                benefits: benefits.filter(Boolean),
                eligibility: eligibility.filter(Boolean),
                offerTypes: form.offerTypes,
                segment: form.segment,
                limitKind: form.limitKind,
                ctaText: form.ctaText || undefined,
                linked: form.linkedLabel && form.linkedHref ? { kind: form.linkedKind, label: form.linkedLabel, href: form.linkedHref } : null,
                claimLimit: form.claimLimit === "" ? null : Number(form.claimLimit),
                claimedCount: offer?.claimedCount ?? 0,
                validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : new Date().toISOString(),
                validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : new Date(nowMs() + 7 * 86400000).toISOString(),
                priority: Number(form.priority),
                isFeatured: form.isFeatured,
                isDealOfTheDay: form.isDealOfTheDay,
                isFlashDeal: form.isFlashDeal,
                status: form.status,
                createdAt: "",
                updatedAt: "",
                deletedAt: null,
              } as SerializedOffer}
              onClaim={() => {}}
            />
          </div>
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : offer ? "Save changes" : "Create offer"}
      </Button>
    </form>
  );
}
