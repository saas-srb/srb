"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Coupon, CouponDuration } from "@/lib/platform/billing/catalog-types";
import type { BillingInterval } from "@/lib/platform/billing/types";
import { saveCouponAction } from "./actions";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30";

/** Date → value for <input type="datetime-local"> in the viewer's time zone. */
function toLocalInput(d: Date | string | null): string {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

interface FormState {
  code: string;
  description: string;
  kind: "percent" | "fixed";
  percentOff: string;
  /** Rupees. */
  amountOff: string;
  allPlans: boolean;
  plans: string[];
  intervals: BillingInterval[];
  duration: CouponDuration;
  durationCycles: string;
  validFrom: string;
  validUntil: string;
  maxRedemptions: string;
  maxPerCompany: string;
  firstTimeOnly: boolean;
  active: boolean;
}

function initialState(c: Coupon | null): FormState {
  return {
    code: c?.code ?? "",
    description: c?.description ?? "",
    kind: c?.kind ?? "percent",
    percentOff: c?.percentOff != null ? String(c.percentOff) : "",
    amountOff: c?.amountOff != null ? String(c.amountOff / 100) : "",
    allPlans: !c || c.plans === "all",
    plans: c && c.plans !== "all" ? c.plans : [],
    intervals: c?.intervals ?? ["monthly", "yearly"],
    duration: c?.duration ?? "once",
    durationCycles: c?.durationCycles != null ? String(c.durationCycles) : "3",
    validFrom: toLocalInput(c?.validFrom ?? null),
    validUntil: toLocalInput(c?.validUntil ?? null),
    maxRedemptions: c?.maxRedemptions != null ? String(c.maxRedemptions) : "",
    maxPerCompany: c ? (c.maxPerCompany != null ? String(c.maxPerCompany) : "") : "1",
    firstTimeOnly: c?.firstTimeOnly ?? false,
    active: c?.active ?? true,
  };
}

export default function CouponForm({ coupon, plans, currency }: { coupon: Coupon | null; plans: { id: string; name: string }[]; currency: string }) {
  const router = useRouter();
  const [v, setV] = useState<FormState>(() => initialState(coupon));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setSaved(false);
    setV((prev) => ({ ...prev, [key]: value }));
  };
  const toggle = <T extends string>(list: T[], item: T, on: boolean) => (on ? [...new Set([...list, item])] : list.filter((x) => x !== item));
  const err = (key: string) => (errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null);
  const field = (id: string, label: string, control: React.ReactNode, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint && !errors[id] && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    start(async () => {
      const res = await saveCouponAction(coupon?._id ?? null, {
        code: v.code,
        description: v.description,
        kind: v.kind,
        percentOff: v.kind === "percent" ? Number(v.percentOff) : null,
        amountOff: v.kind === "fixed" ? Math.round(Number(v.amountOff) * 100) : null,
        plans: v.allPlans ? "all" : v.plans,
        intervals: v.intervals,
        duration: v.duration,
        durationCycles: v.duration === "repeating" ? Number(v.durationCycles) : null,
        validFrom: fromLocalInput(v.validFrom),
        validUntil: fromLocalInput(v.validUntil),
        maxRedemptions: v.maxRedemptions.trim() ? Number(v.maxRedemptions) : null,
        maxPerCompany: v.maxPerCompany.trim() ? Number(v.maxPerCompany) : null,
        firstTimeOnly: v.firstTimeOnly,
        active: v.active,
      });
      if (!res.ok) {
        setErrors(res.errors);
        return;
      }
      setErrors({});
      if (!coupon) router.push(`/console/coupons/${res.id}`);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Code & discount</CardTitle>
          <CardDescription>Codes are matched case-insensitively. Discounts apply before GST, to the plan and any add-ons.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            {field("c-code", "Code", <Input id="c-code" value={v.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="WELCOME20" maxLength={32} autoComplete="off" />)}
            {err("code")}
          </div>
          {field("c-desc", "Internal note (optional)", <Input id="c-desc" value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={300} />)}
          {field(
            "c-kind",
            "Discount type",
            <select id="c-kind" className={selectClass} value={v.kind} onChange={(e) => set("kind", e.target.value === "fixed" ? "fixed" : "percent")}>
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount ({currency})</option>
            </select>,
          )}
          {v.kind === "percent" ? (
            <div className="space-y-1.5">
              {field("c-percent", "Percent off", <Input id="c-percent" type="number" min={0.01} max={100} step="0.01" value={v.percentOff} onChange={(e) => set("percentOff", e.target.value)} />)}
              {err("percentOff")}
            </div>
          ) : (
            <div className="space-y-1.5">
              {field("c-amount", `Amount off (${currency})`, <Input id="c-amount" type="number" min={0.01} step="0.01" value={v.amountOff} onChange={(e) => set("amountOff", e.target.value)} />, "Never more than the order subtotal.")}
              {err("amountOff")}
            </div>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Applies to</CardTitle>
          <CardDescription>Which plans and billing cycles, and for how many billing cycles the discount lasts.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Plans</legend>
            <label className="flex items-center gap-2 text-sm">
              <input id="c-allplans" type="checkbox" className="size-4 accent-primary" checked={v.allPlans} onChange={(e) => set("allPlans", e.target.checked)} />
              All plans
            </label>
            {!v.allPlans && (
              <div className="flex flex-wrap gap-x-4 gap-y-2 pl-6">
                {plans.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-primary" checked={v.plans.includes(p.id)} onChange={(e) => set("plans", toggle(v.plans, p.id, e.target.checked))} />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
            {err("plans")}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Billing cycles</legend>
            <div className="flex flex-wrap gap-4">
              {(["monthly", "yearly"] as const).map((i) => (
                <label key={i} className="flex items-center gap-2 text-sm capitalize">
                  <input type="checkbox" className="size-4 accent-primary" checked={v.intervals.includes(i)} onChange={(e) => set("intervals", toggle(v.intervals, i, e.target.checked))} />
                  {i}
                </label>
              ))}
            </div>
            {err("intervals")}
          </fieldset>
          {field(
            "c-duration",
            "Duration",
            <select id="c-duration" className={selectClass} value={v.duration} onChange={(e) => set("duration", e.target.value as CouponDuration)}>
              <option value="once">First billing cycle only</option>
              <option value="repeating">A number of billing cycles</option>
              <option value="forever">Every billing cycle</option>
            </select>,
          )}
          {v.duration === "repeating" && (
            <div className="space-y-1.5">
              {field("c-cycles", "Number of cycles", <Input id="c-cycles" type="number" min={1} max={120} value={v.durationCycles} onChange={(e) => set("durationCycles", e.target.value)} />)}
              {err("durationCycles")}
            </div>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Limits & validity</CardTitle>
          <CardDescription>Leave a limit empty for unlimited, and a date empty for no bound. Times are in your time zone.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            {field("c-from", "Valid from", <Input id="c-from" type="datetime-local" value={v.validFrom} onChange={(e) => set("validFrom", e.target.value)} />)}
            {err("validFrom")}
          </div>
          <div className="space-y-1.5">
            {field("c-until", "Valid until", <Input id="c-until" type="datetime-local" value={v.validUntil} onChange={(e) => set("validUntil", e.target.value)} />)}
            {err("validUntil")}
          </div>
          <div className="space-y-1.5">
            {field("c-max", "Total redemptions", <Input id="c-max" type="number" min={1} value={v.maxRedemptions} onChange={(e) => set("maxRedemptions", e.target.value)} placeholder="Unlimited" />)}
            {err("maxRedemptions")}
          </div>
          <div className="space-y-1.5">
            {field("c-maxco", "Redemptions per company", <Input id="c-maxco" type="number" min={1} max={100} value={v.maxPerCompany} onChange={(e) => set("maxPerCompany", e.target.value)} placeholder="Unlimited" />)}
            {err("maxPerCompany")}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input id="c-firsttime" type="checkbox" className="size-4 accent-primary" checked={v.firstTimeOnly} onChange={(e) => set("firstTimeOnly", e.target.checked)} />
            First-time subscribers only
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input id="c-active" type="checkbox" className="size-4 accent-primary" checked={v.active} onChange={(e) => set("active", e.target.checked)} />
            Active (can be redeemed)
          </label>
        </CardContent>
      </GlassCard>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : coupon ? "Save coupon" : "Create coupon"}
        </Button>
        {saved && (
          <span className="text-sm text-emerald-600" aria-live="polite">
            Saved.
          </span>
        )}
        {errors.form && <span className="text-sm text-destructive">{errors.form}</span>}
        {Object.keys(errors).length > 0 && !errors.form && (
          <span className="text-sm text-destructive" aria-live="polite">
            Fix the highlighted fields.
          </span>
        )}
      </div>
    </form>
  );
}
