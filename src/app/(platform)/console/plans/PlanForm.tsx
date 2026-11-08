"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MODULES } from "@/lib/platform/onboarding/catalog";
import { BILLING_INTERVALS, PLAN_FLAGS, PLAN_LIMIT_DEFS } from "@/lib/platform/billing/types";
import { savePlanAction } from "./actions";
import type { PlanFormErrors, PlanFormValues } from "./planFormValues";

const STATIC_SELECTABLE = MODULES.filter((m) => !m.core).map((m) => ({ key: m.key, label: m.label, description: m.description }));
const STATIC_CORE = MODULES.filter((m) => m.core).map((m) => m.label).join(", ");
const CYCLE_LABEL = new Map<string, string>(BILLING_INTERVALS.map((i) => [i.id, i.label]));
const checkbox = "size-4 shrink-0 accent-primary";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </GlassCard>
  );
}

/**
 * Create (`mode: "create"`) or edit a plan. Prices are typed in major units
 * (e.g. rupees); blank limits mean unlimited; blank trial days = platform default.
 */
export default function PlanForm({
  mode,
  initial,
  lockedDefault,
  platformTrialDays,
  companies = 0,
  panels,
  coreLabels,
}: {
  mode: "create" | "update";
  initial: PlanFormValues;
  lockedDefault?: boolean;
  platformTrialDays: number;
  companies?: number;
  /** Selectable products with Product Registry names / descriptions (falls back to the built-in list). */
  panels?: { key: string; label: string; description: string }[];
  coreLabels?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<PlanFormValues>(initial);
  const [errors, setErrors] = useState<PlanFormErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const a11y = (key: string, id: string, hint = false) => ({
    id,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${id}-error` : hint ? `${id}-hint` : undefined,
  });

  function toggleList(key: "modules" | "flags", item: string, on: boolean) {
    setValues((v) => ({ ...v, [key]: on ? [...new Set([...v[key], item])] : v[key].filter((m) => m !== item) }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    start(async () => {
      const res = await savePlanAction(mode, values);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setMessage(res.error);
        return;
      }
      setErrors({});
      toast.success(res.message);
      router.push("/console/plans");
      router.refresh();
    });
  }

  const priceChanged =
    mode === "update" &&
    (values.currency !== initial.currency || JSON.stringify(values.cycles.map((c) => [c.enabled, c.enabled ? c.price : ""])) !== JSON.stringify(initial.cycles.map((c) => [c.enabled, c.enabled ? c.price : ""])));

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Section title="Plan">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="plan-id" label="Plan id" hint={mode === "create" ? "Lowercase letters, digits and hyphens, e.g. starter. It can't be changed later." : "Plan ids can't be changed."} error={errors.id}>
            <Input {...a11y("id", "plan-id", true)} value={values.id} onChange={(e) => set("id", e.target.value.toLowerCase())} disabled={mode === "update"} autoComplete="off" spellCheck={false} maxLength={32} required />
          </Field>
          <Field id="plan-name" label="Name" error={errors.name}>
            <Input {...a11y("name", "plan-name")} value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={60} required />
          </Field>
        </div>
        <Field id="plan-description" label="Description" error={errors.description}>
          <Textarea {...a11y("description", "plan-description")} value={values.description} onChange={(e) => set("description", e.target.value)} maxLength={300} rows={2} />
        </Field>
      </Section>

      <Section
        title="Pricing"
        description="Before GST. Choose which billing cycles this plan offers and the price for each."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="plan-currency" label="Currency" error={errors.currency}>
            <Input {...a11y("currency", "plan-currency")} value={values.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={3} autoComplete="off" />
          </Field>
        </div>
        <div role="group" aria-label="Billing cycles" className="grid gap-3 sm:grid-cols-2">
          {values.cycles.map((c, index) => {
            const id = `plan-price-${c.id}`;
            const label = CYCLE_LABEL.get(c.id) ?? c.id;
            return (
              <div key={c.id} className={cn("space-y-2 rounded-xl border border-border p-3", !c.enabled && "opacity-70")}>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    id={`plan-cycle-${c.id}`}
                    className={checkbox}
                    checked={c.enabled}
                    onChange={(e) => set("cycles", values.cycles.map((x, i) => (i === index ? { ...x, enabled: e.target.checked } : x)))}
                  />
                  Offer {label.toLowerCase()} billing
                </label>
                {c.enabled && (
                  <Field id={id} label={`${label} price (${values.currency || "—"})`} error={errors[`price.${c.id}`]}>
                    <Input {...a11y(`price.${c.id}`, id)} inputMode="decimal" value={c.price} onChange={(e) => set("cycles", values.cycles.map((x, i) => (i === index ? { ...x, price: e.target.value } : x)))} placeholder="0" />
                  </Field>
                )}
                {c.enabled && (
                  <Field id={`${id}-list`} label={`Usual ${label.toLowerCase()} price, shown struck through (optional)`} hint="Display only. What is charged is the price above." error={errors[`listPrice.${c.id}`]}>
                    <Input {...a11y(`listPrice.${c.id}`, `${id}-list`)} inputMode="decimal" value={c.list ?? ""} onChange={(e) => set("cycles", values.cycles.map((x, i) => (i === index ? { ...x, list: e.target.value } : x)))} placeholder="e.g. 1999" />
                  </Field>
                )}
              </div>
            );
          })}
        </div>
        {errors.intervals && <p className="text-xs text-destructive">{errors.intervals}</p>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="plan-offer-label" label="Offer badge" hint="Shown on the card, e.g. “Launch offer”." error={errors.offerLabel}>
            <Input {...a11y("offerLabel", "plan-offer-label")} value={values.offerLabel} onChange={(e) => set("offerLabel", e.target.value)} maxLength={40} />
          </Field>
          <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
            <input type="checkbox" className={cn(checkbox, "mt-0.5")} checked={values.lifetimeFree} onChange={(e) => set("lifetimeFree", e.target.checked)} />
            <span><span className="block font-medium">Free for life</span><span className="block text-xs text-muted-foreground">Never billed, no trial. A company stays on it until it upgrades.</span></span>
          </label>
          <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
            <input type="checkbox" className={cn(checkbox, "mt-0.5")} checked={values.contactSales} onChange={(e) => set("contactSales", e.target.checked)} />
            <span><span className="block font-medium">Contact support instead of a price</span><span className="block text-xs text-muted-foreground">Not sold online; the pricing page shows “Contact support”.</span></span>
          </label>
        </div>
        <p className={cn("text-xs", priceChanged ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground")} role={priceChanged ? "status" : undefined}>
          {priceChanged
            ? `Saving creates a new price version. It applies to new subscriptions only${companies > 0 ? ` — the ${companies} ${companies === 1 ? "company" : "companies"} already on this plan keep the price they bought` : ""}.`
            : "Price changes create a new price version for new subscriptions; existing subscribers keep the price they bought."}
        </p>
      </Section>

      <Section title="Products" description={`Always included: ${coreLabels ?? STATIC_CORE}.`}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" id="plan-all-modules" className={checkbox} checked={values.allModules} onChange={(e) => set("allModules", e.target.checked)} />
          Every product (including products added later)
        </label>
        {!values.allModules && (
          <div role="group" aria-label="Included products" aria-describedby={errors.modules ? "plan-modules-error" : undefined} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(panels ?? STATIC_SELECTABLE).map((m) => (
              <label key={m.key} className="flex items-start gap-2 rounded-lg border border-border p-2 text-sm">
                <input type="checkbox" name="module" value={m.key} className={cn(checkbox, "mt-0.5")} checked={values.modules.includes(m.key)} onChange={(e) => toggleList("modules", m.key, e.target.checked)} />
                <span className="min-w-0">
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.description}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {errors.modules && (
          <p id="plan-modules-error" className="text-xs text-destructive">
            {errors.modules}
          </p>
        )}
      </Section>

      <Section title="Features" description="What the pricing page shows for this plan.">
        <Field id="plan-highlights" label="Highlights (one per line)" hint="Up to 12 short bullet points, e.g. “Unlimited projects”." error={errors.highlights}>
          <Textarea {...a11y("highlights", "plan-highlights", true)} value={values.highlights} onChange={(e) => set("highlights", e.target.value)} rows={4} />
        </Field>
        <div role="group" aria-label="Feature flags" className="space-y-2">
          <p className="text-sm font-medium">Feature flags</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PLAN_FLAGS.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="flag" value={f.key} className={checkbox} checked={values.flags.includes(f.key)} onChange={(e) => toggleList("flags", f.key, e.target.checked)} />
                {f.label}
              </label>
            ))}
          </div>
          {errors.flags && <p className="text-xs text-destructive">{errors.flags}</p>}
        </div>
      </Section>

      <Section title="Limits" description="Leave a limit blank for unlimited. Limit changes apply to every company on the plan right away.">
        <div className="grid gap-4 sm:grid-cols-3">
          {PLAN_LIMIT_DEFS.map((d) => (
            <Field key={d.key} id={`plan-limit-${d.key}`} label={d.label} error={errors[`limit.${d.key}`]}>
              <Input {...a11y(`limit.${d.key}`, `plan-limit-${d.key}`)} inputMode="numeric" value={values.limits[d.key] ?? ""} onChange={(e) => set("limits", { ...values.limits, [d.key]: e.target.value })} placeholder="Unlimited" />
            </Field>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Other limits</p>
          {values.customLimits.length === 0 && <p className="text-xs text-muted-foreground">None. Add one for anything else you meter, e.g. projects.</p>}
          {values.customLimits.map((row, index) => {
            const error = errors[`customLimits.${index}`] ?? errors[`limit.${row.key.trim()}`];
            return (
              <div key={index} className="space-y-1">
                <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <Field id={`plan-custom-key-${index}`} label="Key">
                    <Input
                      id={`plan-custom-key-${index}`}
                      value={row.key}
                      onChange={(e) => set("customLimits", values.customLimits.map((r, i) => (i === index ? { ...r, key: e.target.value.replace(/\s/g, "") } : r)))}
                      placeholder="projects"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={40}
                    />
                  </Field>
                  <Field id={`plan-custom-value-${index}`} label="Limit">
                    <Input id={`plan-custom-value-${index}`} inputMode="numeric" value={row.value} onChange={(e) => set("customLimits", values.customLimits.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))} placeholder="Unlimited" />
                  </Field>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove limit ${row.key || index + 1}`} onClick={() => set("customLimits", values.customLimits.filter((_, i) => i !== index))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
            );
          })}
          {errors.limits && <p className="text-xs text-destructive">{errors.limits}</p>}
          <Button type="button" variant="outline" size="sm" onClick={() => set("customLimits", [...values.customLimits, { key: "", value: "" }])}>
            <Plus className="size-3.5" data-icon="inline-start" /> Add limit
          </Button>
        </div>
      </Section>

      <Section title="Trial & availability">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="plan-trialDays" label="Free trial (days)" hint={`Blank = platform default (${platformTrialDays} days). 0 = no trial. Applies to trials started from now on.`} error={errors.trialDays}>
            <Input {...a11y("trialDays", "plan-trialDays", true)} inputMode="numeric" value={values.trialDays} onChange={(e) => set("trialDays", e.target.value)} placeholder={`${platformTrialDays} (default)`} />
          </Field>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" id="plan-active" className={checkbox} checked={values.active} disabled={lockedDefault} onChange={(e) => set("active", e.target.checked)} />
            Active — offered for new subscriptions
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              id="plan-default"
              className={checkbox}
              checked={values.isDefault}
              disabled={lockedDefault}
              aria-describedby={errors.isDefault ? "plan-isDefault-error" : undefined}
              onChange={(e) => setValues((v) => ({ ...v, isDefault: e.target.checked, active: e.target.checked ? true : v.active }))}
            />
            Default plan for new sign-ups (replaces the current default)
          </label>
          {lockedDefault && <p className="text-xs text-muted-foreground">This is the default plan. To change that, make another plan the default.</p>}
          {errors.isDefault && (
            <p id="plan-isDefault-error" className="text-xs text-destructive">
              {errors.isDefault}
            </p>
          )}
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" id="plan-save" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : mode === "create" ? "Create plan" : "Save plan"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/console/plans")} disabled={pending}>
          Cancel
        </Button>
        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
