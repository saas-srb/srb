import type { Metadata } from "next";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { subscriptionStatusLabel } from "@/components/platform/billing/SubscriptionStatusBadge";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { listPlans } from "@/lib/platform/billing/plans";
import { SUBSCRIPTION_STATUSES, listSubscriptions } from "@/lib/platform/billing/subscriptions-admin";
import { formatMoney } from "@/lib/platform/billing/types";
import SubscriptionsFilterBar from "./SubscriptionsFilterBar";
import SubscriptionsGrid from "./SubscriptionsGrid";

export const metadata: Metadata = { title: "Subscriptions" };

export default async function PlatformSubscriptionsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; plan?: string; page?: string }> }) {
  await requirePlatformPermission("subscriptions.read");
  const sp = await searchParams;
  const [list, plans] = await Promise.all([listSubscriptions({ q: sp.q, status: sp.status, planId: sp.plan, page: Number(sp.page) || 1 }), listPlans()]);
  const status = SUBSCRIPTION_STATUSES.includes(sp.status as never) ? sp.status! : "";
  const plan = plans.some((p) => p._id === sp.plan) ? sp.plan! : "";
  const tiles = [
    { label: "MRR (pre-tax)", value: formatMoney(list.totals.mrr, list.totals.currency) },
    { label: "Active", value: String(list.totals.byStatus.active ?? 0) },
    { label: "Trialing", value: String(list.totals.byStatus.trialing ?? 0) },
    { label: "Past due / grace", value: String((list.totals.byStatus.past_due ?? 0) + (list.totals.byStatus.grace ?? 0)) },
  ];

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="Subscriptions" description="Every company's plan, billing cycle and payment status. Open one to change plan, extend a trial or manage access." crumbs={[{ label: "Billing" }]} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <GlassCard key={t.label} interactive={false}>
            <CardContent className="space-y-1 py-1">
              <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
              <p className="text-xl font-bold tabular-nums">{t.value}</p>
            </CardContent>
          </GlassCard>
        ))}
      </div>
      <SubscriptionsGrid
        rows={list.rows}
        total={list.total}
        page={list.page}
        totalPages={list.totalPages}
        hasActiveFilters={Boolean(sp.q || status || plan)}
        filters={
          <SubscriptionsFilterBar
            initialSearch={sp.q ?? ""}
            initialStatus={status}
            initialPlan={plan}
            statuses={SUBSCRIPTION_STATUSES.map((s) => ({ value: s, label: subscriptionStatusLabel(s) }))}
            plans={plans.map((p) => ({ id: p._id, name: p.name }))}
          />
        }
      />
    </div>
  );
}
