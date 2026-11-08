import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { GST_STATES, getBillingSettings } from "@/lib/platform/billing/settings";
import BillingSettingsForm from "./BillingSettingsForm";

export const metadata: Metadata = { title: "Tax & invoicing" };

export default async function PlatformBillingSettingsPage() {
  const user = await requirePlatformPermission("tax.read");
  const { seller, tax, invoice, billing, updatedAt } = await getBillingSettings();

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Tax & invoicing"
        description="The seller identity, GST and invoice settings on every SaaS invoice, and the billing defaults for new subscriptions."
        crumbs={[{ label: "Billing" }]}
      />
      <BillingSettingsForm initial={{ seller, tax, invoice, billing }} states={Object.entries(GST_STATES).map(([code, name]) => ({ code, name }))} prefilled={!updatedAt} canEdit={can(user, "tax.manage")} />
    </div>
  );
}
