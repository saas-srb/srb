"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import ServicePicker from "@/components/products/dealflow-ai/offers/ServicePicker";
import { AUDIENCES, DISCOUNT_TYPES, type Audience, type DiscountType } from "@/lib/offers/constants";
import { getCategoryLabel, type CategorySlug } from "@/lib/categories";
import { saveCouponAction } from "@/app/(products)/sitecraft-ai/(protected)/offers/coupons/actions";
import type { SerializedCoupon } from "@/lib/offers/coupons";
import type { ApplicableServiceInput } from "@/lib/offers/coupon-validation";

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CouponForm({
  coupon,
  campaignOptions,
}: {
  coupon?: SerializedCoupon;
  campaignOptions: { _id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    code: coupon?.code ?? "",
    campaignId: coupon?.campaignId ?? "",
    discountType: coupon?.discountType ?? ("percentage" as DiscountType),
    discountAmount: coupon?.discountAmount ?? "",
    maxDiscountCap: coupon?.maxDiscountCap ?? "",
    minOrderValue: coupon?.minOrderValue ?? "",
    applicableAudience: coupon?.applicableAudience ?? (["ALL"] as Audience[]),
    startDate: toLocalInput(coupon?.startDate),
    endDate: toLocalInput(coupon?.endDate),
    usageLimit: coupon?.usageLimit ?? "",
    perUserLimit: coupon?.perUserLimit ?? "",
    isActive: coupon?.isActive ?? true,
  });
  const [services, setServices] = useState<ApplicableServiceInput[]>(coupon?.applicableServices ?? []);
  const [pickerCategory, setPickerCategory] = useState<CategorySlug | "">("");
  const [pickerSub, setPickerSub] = useState("");

  function toggleAudience(value: Audience) {
    setForm((f) => ({
      ...f,
      applicableAudience: f.applicableAudience.includes(value)
        ? f.applicableAudience.filter((a) => a !== value)
        : [...f.applicableAudience, value],
    }));
  }

  function addService() {
    if (!pickerCategory) return;
    setServices([...services, { category: pickerCategory, subService: pickerSub || undefined }]);
    setPickerCategory("");
    setPickerSub("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    start(async () => {
      const res = await saveCouponAction(coupon?._id ?? null, {
        code: form.code,
        campaignId: form.campaignId || undefined,
        discountType: form.discountType,
        discountAmount: form.discountAmount === "" ? undefined : Number(form.discountAmount),
        maxDiscountCap: form.maxDiscountCap === "" ? undefined : Number(form.maxDiscountCap),
        minOrderValue: form.minOrderValue === "" ? undefined : Number(form.minOrderValue),
        applicableServices: services,
        applicableAudience: form.applicableAudience,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : "",
        endDate: form.endDate ? new Date(form.endDate).toISOString() : "",
        usageLimit: form.usageLimit === "" ? undefined : Number(form.usageLimit),
        perUserLimit: form.perUserLimit === "" ? undefined : Number(form.perUserLimit),
        isActive: form.isActive,
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Code</Label>
          <Input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="DIWALI50"
            className="font-mono uppercase"
            required
          />
          {fieldErrors.code && <p className="text-xs text-destructive">{fieldErrors.code}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Scoped to campaign (optional — blank = sitewide)</Label>
          <Select value={form.campaignId || "__none__"} onValueChange={(v) => setForm({ ...form, campaignId: !v || v === "__none__" ? "" : v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No campaign scope</SelectItem>
              {campaignOptions.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Discount type</Label>
          <Select value={form.discountType} onValueChange={(v) => v && setForm({ ...form, discountType: v as DiscountType })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DISCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Discount amount</Label>
          <Input type="number" min={0} value={form.discountAmount} onChange={(e) => setForm({ ...form, discountAmount: e.target.value })} required />
          {fieldErrors.discountAmount && <p className="text-xs text-destructive">{fieldErrors.discountAmount}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Max discount cap (optional)</Label>
          <Input type="number" min={0} value={form.maxDiscountCap} onChange={(e) => setForm({ ...form, maxDiscountCap: e.target.value })} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Minimum order value (optional)</Label>
        <Input type="number" min={0} value={form.minOrderValue} onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })} />
      </div>

      <div className="space-y-1.5">
        <Label>Applicable audience</Label>
        <div className="flex flex-wrap gap-3">
          {AUDIENCES.map((a) => (
            <label key={a.value} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={form.applicableAudience.includes(a.value)} onChange={() => toggleAudience(a.value)} />
              {a.label}
            </label>
          ))}
        </div>
        {fieldErrors.applicableAudience && <p className="text-xs text-destructive">{fieldErrors.applicableAudience}</p>}
      </div>

      <div className="space-y-3 rounded-xl border border-border/50 p-4">
        <p className="text-sm font-semibold text-foreground">Applicable services (optional — blank = all services)</p>
        <ServicePicker category={pickerCategory} subService={pickerSub} onCategoryChange={setPickerCategory} onSubServiceChange={setPickerSub} allowAllSubService />
        <Button type="button" variant="outline" size="sm" onClick={addService} disabled={!pickerCategory}>
          <Plus className="size-3.5" /> Add
        </Button>
        {services.length > 0 && (
          <ul className="space-y-1.5">
            {services.map((s, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5 text-sm">
                <span>
                  {getCategoryLabel(s.category)}
                  {s.subService && s.subService !== "all" ? ` — ${s.subService}` : ""}
                </span>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setServices(services.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Start date</Label>
          <Input type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
          {fieldErrors.startDate && <p className="text-xs text-destructive">{fieldErrors.startDate}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>End date</Label>
          <Input type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
          {fieldErrors.endDate && <p className="text-xs text-destructive">{fieldErrors.endDate}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Total usage limit (optional)</Label>
          <Input type="number" min={1} value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Per-user usage limit (optional)</Label>
          <Input type="number" min={1} value={form.perUserLimit} onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
        Active
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : coupon ? "Save changes" : "Create coupon"}
      </Button>
    </form>
  );
}
