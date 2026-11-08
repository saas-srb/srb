import { listPanelChoices } from "@/lib/platform/panels/choices";
import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import PlanForm from "../PlanForm";
import { emptyPlanForm } from "../planFormValues";

export const metadata: Metadata = { title: "New plan" };

export default async function NewPlanPage() {
  const choices = await listPanelChoices({ includeUnavailable: true });
  await requirePlatformPermission("plans.read");
  const { billing } = await getBillingSettings();
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="New plan" description="Add a plan companies can subscribe to." crumbs={[{ label: "Plans & pricing", href: "/console/plans" }]} />
      <div className="max-w-4xl">
        <PlanForm panels={choices.filter((c) => !c.core)} coreLabels={choices.filter((c) => c.core).map((c) => c.label).join(", ")} mode="create" initial={emptyPlanForm(billing.currency)} platformTrialDays={billing.defaultTrialDays} />
      </div>
    </div>
  );
}
