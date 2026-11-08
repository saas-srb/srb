"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ADDON_LIMIT_KEYS, type Addon, type AddonLimitKey } from "@/lib/platform/billing/catalog-types";
import { saveAddonAction } from "./actions";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30";

interface FormState {
  name: string;
  description: string;
  /** Rupees. */
  priceMonthly: string;
  priceYearly: string;
  type: "limit" | "module";
  limitKey: AddonLimitKey;
  amountPerUnit: string;
  moduleKey: string;
  allPlans: boolean;
  plans: string[];
  maxQuantity: string;
  active: boolean;
  sortOrder: string;
}

const rupees = (paise: number | undefined) => (paise === undefined ? "" : String(paise / 100));

export default function AddonForm({ addon, plans, modules, currency }: { addon: Addon | null; plans: { id: string; name: string }[]; modules: { key: string; label: string }[]; currency: string }) {
  const router = useRouter();
  const [v, setV] = useState<FormState>(() => ({
    name: addon?.name ?? "",
    description: addon?.description ?? "",
    priceMonthly: rupees(addon?.priceMonthly),
    priceYearly: rupees(addon?.priceYearly),
    type: addon?.type ?? "limit",
    limitKey: addon?.limitKey ?? "seats",
    amountPerUnit: addon?.amountPerUnit != null ? String(addon.amountPerUnit) : "",
    moduleKey: addon?.moduleKey ?? "",
    allPlans: !addon || addon.plans === "all",
    plans: addon && addon.plans !== "all" ? addon.plans : [],
    maxQuantity: addon?.maxQuantity != null && addon.type === "limit" ? String(addon.maxQuantity) : "",
    active: addon?.active ?? true,
    sortOrder: String(addon?.sortOrder ?? 0),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setSaved(false);
    setV((prev) => ({ ...prev, [key]: value }));
  };
  const err = (key: string) => (errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null);
  const field = (id: string, label: string, control: React.ReactNode, errKey?: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
      {errKey && err(errKey)}
      {hint && !(errKey && errors[errKey]) && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  const unit = ADDON_LIMIT_KEYS.find((k) => k.key === v.limitKey)?.unit ?? "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    start(async () => {
      const res = await saveAddonAction(addon?._id ?? null, {
        name: v.name,
        description: v.description,
        priceMonthly: Math.round(Number(v.priceMonthly || 0) * 100),
        priceYearly: Math.round(Number(v.priceYearly || 0) * 100),
        type: v.type,
        limitKey: v.type === "limit" ? v.limitKey : null,
        amountPerUnit: v.type === "limit" ? Number(v.amountPerUnit) : null,
        moduleKey: v.type === "module" ? v.moduleKey : null,
        plans: v.allPlans ? "all" : v.plans,
        maxQuantity: v.type === "limit" && v.maxQuantity.trim() ? Number(v.maxQuantity) : null,
        active: v.active,
        sortOrder: Number(v.sortOrder) || 0,
      });
      if (!res.ok) {
        setErrors(res.errors);
        return;
      }
      setErrors({});
      if (!addon) router.push(`/console/addons/${res.id}`);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Add-on</CardTitle>
          <CardDescription>Prices are per unit, per billing cycle, before GST.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("a-name", "Name", <Input id="a-name" value={v.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder="5 extra seats" />, "name")}
          {field("a-desc", "Description (optional)", <Input id="a-desc" value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={300} />)}
          {field("a-monthly", `Monthly price per unit (${currency})`, <Input id="a-monthly" type="number" min={0} step="0.01" value={v.priceMonthly} onChange={(e) => set("priceMonthly", e.target.value)} />, "priceMonthly")}
          {field("a-yearly", `Yearly price per unit (${currency})`, <Input id="a-yearly" type="number" min={0} step="0.01" value={v.priceYearly} onChange={(e) => set("priceYearly", e.target.value)} />, "priceYearly")}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">What it gives</CardTitle>
          <CardDescription>Raise a plan limit per unit, or unlock one product the plan doesn&apos;t include.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field(
            "a-type",
            "Type",
            <select id="a-type" className={selectClass} value={v.type} onChange={(e) => set("type", e.target.value === "module" ? "module" : "limit")} disabled={Boolean(addon)}>
              <option value="limit">Limit booster</option>
              <option value="module">Product unlock</option>
            </select>,
            undefined,
            addon ? "The type can't change after creation." : undefined,
          )}
          {v.type === "limit" ? (
            <>
              {field(
                "a-limit",
                "Limit",
                <select id="a-limit" className={selectClass} value={v.limitKey} onChange={(e) => set("limitKey", e.target.value as AddonLimitKey)}>
                  {ADDON_LIMIT_KEYS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
                </select>,
                "limitKey",
              )}
              {field("a-amount", `Adds per unit (${unit})`, <Input id="a-amount" type="number" min={1} value={v.amountPerUnit} onChange={(e) => set("amountPerUnit", e.target.value)} />, "amountPerUnit")}
              {field("a-maxqty", "Max units per company", <Input id="a-maxqty" type="number" min={1} value={v.maxQuantity} onChange={(e) => set("maxQuantity", e.target.value)} placeholder="Unlimited" />, "maxQuantity")}
            </>
          ) : (
            field(
              "a-module",
              "Product",
              <select id="a-module" className={selectClass} value={v.moduleKey} onChange={(e) => set("moduleKey", e.target.value)}>
                <option value="">Choose…</option>
                {modules.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>,
              "moduleKey",
            )
          )}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Availability</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Plans</legend>
            <label className="flex items-center gap-2 text-sm">
              <input id="a-allplans" type="checkbox" className="size-4 accent-primary" checked={v.allPlans} onChange={(e) => set("allPlans", e.target.checked)} />
              All plans
            </label>
            {!v.allPlans && (
              <div className="flex flex-wrap gap-x-4 gap-y-2 pl-6">
                {plans.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={v.plans.includes(p.id)}
                      onChange={(e) => set("plans", e.target.checked ? [...new Set([...v.plans, p.id])] : v.plans.filter((x) => x !== p.id))}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
            {err("plans")}
          </fieldset>
          <div className="space-y-4">
            {field("a-sort", "Sort order", <Input id="a-sort" type="number" value={v.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />)}
            <label className="flex items-center gap-2 text-sm">
              <input id="a-active" type="checkbox" className="size-4 accent-primary" checked={v.active} onChange={(e) => set("active", e.target.checked)} />
              Active (offered to companies)
            </label>
          </div>
        </CardContent>
      </GlassCard>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : addon ? "Save add-on" : "Create add-on"}
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
