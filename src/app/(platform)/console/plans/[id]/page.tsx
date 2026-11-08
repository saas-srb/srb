import { listPanelChoices } from "@/lib/platform/panels/choices";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { formatDate } from "@/lib/utils";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { countCompaniesOnPlan, getPlan } from "@/lib/platform/billing/plans";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { currentPriceVersion } from "@/lib/platform/billing/pricing";
import { BILLING_INTERVALS, formatMoney } from "@/lib/platform/billing/types";
import PlanForm from "../PlanForm";
import { planToFormValues } from "../planFormValues";

export const metadata: Metadata = { title: "Edit plan" };

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const choices = await listPanelChoices({ includeUnavailable: true });
  await requirePlatformPermission("plans.read");
  const { id } = await params;
  const [plan, companies, settings] = await Promise.all([getPlan(id), countCompaniesOnPlan(id), getBillingSettings()]);
  if (!plan) notFound();
  const history = [...(plan.priceHistory ?? [])].reverse();
  const current = currentPriceVersion(plan);

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title={`Edit ${plan.name}`}
        description={`${companies === 0 ? "No company is on this plan yet." : `${companies} ${companies === 1 ? "company is" : "companies are"} on this plan.`} Product, feature and limit changes apply to them right away; price changes apply to new subscriptions only.`}
        crumbs={[{ label: "Plans & pricing", href: "/console/plans" }]}
      />
      <div className="grid max-w-6xl gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <PlanForm panels={choices.filter((c) => !c.core)} coreLabels={choices.filter((c) => c.core).map((c) => c.label).join(", ")} mode="update" initial={planToFormValues(plan)} lockedDefault={plan.isDefault && plan.active} platformTrialDays={settings.billing.defaultTrialDays} companies={companies} />
        <GlassCard interactive={false} className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Price history</CardTitle>
            <CardDescription>Each price change is a new version. A subscription keeps the version it bought.</CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Version {current} (from before price versions were recorded).</p>
            ) : (
              <ol className="divide-y divide-border text-sm" aria-label="Price versions">
                {history.map((v) => (
                  <li key={v.version} className="space-y-1 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">v{v.version}</span>
                      {v.version === current && <Badge variant="secondary">Current</Badge>}
                      <span className="text-xs text-muted-foreground">from {formatDate(v.effectiveFrom)}</span>
                    </div>
                    <p className="text-muted-foreground">
                      {BILLING_INTERVALS.filter((i) => v.intervals.includes(i.id))
                        .map((i) => `${formatMoney(v.prices[i.id] ?? 0, v.currency)} ${i.adjective}`)
                        .join(" · ") || "No cycles"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </GlassCard>
      </div>
    </div>
  );
}
