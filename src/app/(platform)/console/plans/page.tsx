import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { cn } from "@/lib/utils";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { countCompaniesByPlan, listPlans } from "@/lib/platform/billing/plans";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { currentPriceVersion, planIntervals, planPrice } from "@/lib/platform/billing/pricing";
import { BILLING_INTERVALS, PLAN_FLAGS, PLAN_LIMIT_DEFS, formatMoney, type Plan } from "@/lib/platform/billing/types";
import { MODULES } from "@/lib/platform/onboarding/catalog";
import { panelLabels } from "@/lib/platform/panels/choices";
import PlanActions from "./PlanActions";
import LoadSimplePricing from "./LoadSimplePricing";

export const metadata: Metadata = { title: "Plans & pricing" };

const LABELS = new Map<string, string>(MODULES.map((m) => [m.key, m.label]));
const FLAG_LABELS = new Map<string, string>(PLAN_FLAGS.map((f) => [f.key, f.label]));
const LIMIT_DEFS = new Map<string, { label: string; unit: string }>(PLAN_LIMIT_DEFS.map((d) => [d.key, d]));
const nf = new Intl.NumberFormat("en-IN");

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-foreground">{children}</dd>
    </div>
  );
}

function panels(plan: Plan): string {
  if (plan.modules === "all") return "Every product";
  return plan.modules.map((m) => LABELS.get(m) ?? m).join(", ");
}

export default async function PlansPage() {
  // Product names come from the Product Registry (names are global, so refreshing this shared map is safe).
  for (const [k, v] of await panelLabels()) LABELS.set(k, v);
  await requirePlatformPermission("plans.read");
  const [plans, counts, settings] = await Promise.all([listPlans(), countCompaniesByPlan(), getBillingSettings()]);
  const defaultTrial = settings.billing.defaultTrialDays;

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Plans & pricing"
        description="What companies can subscribe to. Prices exclude GST. A price change creates a new price version for new subscriptions; companies already subscribed keep what they bought."
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <LoadSimplePricing />
            <Link href="/console/plans/new" id="plan-new" className={cn(buttonVariants())}>
              <Plus className="size-4" data-icon="inline-start" /> New plan
            </Link>
          </div>
        }
      />

      <PanelListFilters>
{plans.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">No plans yet. Create one to start selling.</CardContent>
        </GlassCard>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2" aria-label="Plans">
          {plans.map((plan, index) => {
            const companies = counts.get(plan._id) ?? 0;
            const custom = Object.entries(plan.limits).filter(([k]) => !LIMIT_DEFS.has(k));
            return (
              <li key={plan._id} data-plan-id={plan._id}>
                <GlassCard interactive={false} className={cn("h-full", !plan.active && "opacity-80")}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="text-base">{plan.name}</CardTitle>
                        <CardDescription className="break-words">
                          <code className="text-xs">{plan._id}</code>
                          {plan.description && <> · {plan.description}</>}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {plan.isDefault && <Badge>Default</Badge>}
                        {plan.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                        <Badge variant="outline" title="Price version">
                          v{currentPriceVersion(plan)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {BILLING_INTERVALS.map((i) => {
                        const price = planIntervals(plan).includes(i.id) ? planPrice(plan, i.id) : null;
                        return (
                          <Field key={i.id} label={i.label}>
                            {price === null ? <span className="text-muted-foreground">Not offered</span> : formatMoney(price, plan.currency)}
                          </Field>
                        );
                      })}
                      {PLAN_LIMIT_DEFS.map((d) => (
                        <Field key={d.key} label={d.label}>
                          {plan.limits[d.key] === null || plan.limits[d.key] === undefined ? "Unlimited" : `${nf.format(plan.limits[d.key]!)} ${d.unit}`}
                        </Field>
                      ))}
                      {custom.map(([k, v]) => (
                        <Field key={k} label={k}>
                          {v === null ? "Unlimited" : nf.format(v)}
                        </Field>
                      ))}
                      <Field label="Free trial">
                        {plan.trialDays === null || plan.trialDays === undefined ? `${defaultTrial} days (platform default)` : plan.trialDays === 0 ? "No trial" : `${plan.trialDays} days`}
                      </Field>
                      <Field label="Companies on it">{companies}</Field>
                      <Field label="Products (plus the core products)" wide>
                        {panels(plan)}
                      </Field>
                      {(plan.flags?.length ?? 0) > 0 && (
                        <Field label="Feature flags" wide>
                          {plan.flags!.map((f) => FLAG_LABELS.get(f) ?? f).join(", ")}
                        </Field>
                      )}
                      {(plan.highlights?.length ?? 0) > 0 && (
                        <Field label="Highlights" wide>
                          <ul className="list-inside list-disc space-y-0.5">
                            {plan.highlights!.map((h, i) => (
                              <li key={i}>{h}</li>
                            ))}
                          </ul>
                        </Field>
                      )}
                    </dl>
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                      <Link href={`/console/plans/${encodeURIComponent(plan._id)}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} aria-label={`Edit ${plan.name}`}>
                        <Pencil className="size-3.5" data-icon="inline-start" /> Edit
                      </Link>
                      <PlanActions planId={plan._id} planName={plan.name} active={plan.active} isDefault={plan.isDefault} companies={companies} first={index === 0} last={index === plans.length - 1} />
                    </div>
                  </CardContent>
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
</PanelListFilters>
    </div>
  );
}
