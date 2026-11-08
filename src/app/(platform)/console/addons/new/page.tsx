import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { listPlans } from "@/lib/platform/billing/plans";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { MODULES } from "@/lib/platform/onboarding/catalog";
import { panelLabels } from "@/lib/platform/panels/choices";
import AddonForm from "../AddonForm";

export const metadata: Metadata = { title: "New add-on" };

export default async function NewAddonPage() {
  const labels = await panelLabels();
  await requirePlatformPermission("addons.read");
  const [plans, settings] = await Promise.all([listPlans(), getBillingSettings()]);
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="New add-on" crumbs={[{ label: "Billing" }, { label: "Add-ons", href: "/console/addons" }]} />
      <AddonForm
        addon={null}
        plans={plans.map((p) => ({ id: p._id, name: p.name }))}
        modules={MODULES.filter((m) => !m.core).map((m) => ({ key: m.key, label: labels.get(m.key) ?? m.label }))}
        currency={settings.billing.currency}
      />
    </div>
  );
}
