import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import ActiveToggleButton from "@/components/platform/panel/ActiveToggleButton";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { getAddon, listAddonHolders } from "@/lib/platform/billing/addons";
import { listPlans } from "@/lib/platform/billing/plans";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { MODULES } from "@/lib/platform/onboarding/catalog";
import { panelLabels } from "@/lib/platform/panels/choices";
import { describeAddonEffect } from "@/lib/platform/billing/catalog-types";
import AddonForm from "../AddonForm";
import { setAddonActiveAction } from "../actions";

export const metadata: Metadata = { title: "Add-on" };

export default async function AddonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const labels = await panelLabels();
  await requirePlatformPermission("addons.read");
  const addon = await getAddon((await params).id);
  if (!addon) notFound();
  const [plans, settings, holders] = await Promise.all([listPlans(), getBillingSettings(), listAddonHolders(addon._id)]);

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title={addon.name}
        description={`${describeAddonEffect(addon)} · held by ${holders.length} compan${holders.length === 1 ? "y" : "ies"}`}
        crumbs={[{ label: "Billing" }, { label: "Add-ons", href: "/console/addons" }]}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {addon.active ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}
            <ActiveToggleButton id={addon._id} active={addon.active} noun="add-on" action={setAddonActiveAction} />
          </div>
        }
      />

      <AddonForm
        key={addon.updatedAt.toISOString()}
        addon={addon}
        plans={plans.map((p) => ({ id: p._id, name: p.name }))}
        modules={MODULES.filter((m) => !m.core).map((m) => ({ key: m.key, label: labels.get(m.key) ?? m.label }))}
        currency={settings.billing.currency}
      />

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Companies with this add-on</CardTitle>
          <CardDescription>Add or remove it from a company on the company&apos;s page. Deactivating stops new sales; existing holders keep it.</CardDescription>
        </CardHeader>
        <CardContent>
          {holders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No company has this add-on yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {holders.map((h) => (
                <li key={h.companyId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/console/companies/${h.companyId}`} className="font-medium hover:underline">
                    {h.name}
                  </Link>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    × {h.quantity} · since {formatDate(h.addedAt)}
                    {h.complimentary && <Badge variant="outline">Complimentary</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}
