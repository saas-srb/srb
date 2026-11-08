import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import SubscriptionStatusBadge from "@/components/platform/billing/SubscriptionStatusBadge";
import { formatDate, formatDateTime } from "@/lib/utils";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { listPlans } from "@/lib/platform/billing/plans";
import { getSubscriptionDetail } from "@/lib/platform/billing/subscriptions-admin";
import { formatMoney } from "@/lib/platform/billing/types";
import SubscriptionActions from "./SubscriptionActions";

export const metadata: Metadata = { title: "Subscription" };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-foreground">{children}</dd>
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  trial_started: "Trial started",
  activated: "Activated",
  plan_changed: "Plan changed",
  past_due: "Payment failed (past due)",
  grace: "Grace period",
  suspended: "Suspended",
  canceled: "Canceled",
  reactivated: "Reactivated",
};

export default async function PlatformSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPermission("subscriptions.read");
  const detail = await getSubscriptionDetail((await params).id);
  if (!detail) notFound();
  const { row, sub, events, audit } = detail;
  const plans = (await listPlans()).filter((p) => p.active || p._id === sub.planId);
  const pricing = sub.pricing && sub.pricing.planId === sub.planId && sub.pricing.interval === sub.interval ? sub.pricing : null;

  return (
    <div className="space-y-4 p-1">
      <PanelPageHeader
        breadcrumbs={[{ label: "Platform", href: "/console" }, { label: "Subscriptions", href: "/console/subscriptions" }, { label: row.name }]}
        title={<>{row.name}</>}
        description={<><Link href={`/console/companies/${row.companyId}`} className="hover:text-foreground hover:underline">
                  Company details
                </Link></>}
        actions={<><SubscriptionStatusBadge status={row.status} complimentary={row.complimentary} cancelAtPeriodEnd={row.cancelAtPeriodEnd} /></>}
      />

      <GlassCard interactive={false}>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label="Plan">{row.planName}</Field>
            <Field label="Billing cycle">{row.status === "internal" ? "—" : row.interval === "yearly" ? "Yearly" : "Monthly"}</Field>
            <Field label="MRR (pre-tax)">{row.mrr ? formatMoney(row.mrr, row.currency) : "—"}</Field>
            <Field label="Charged per cycle">{pricing ? `${formatMoney(pricing.total, pricing.currency)} incl. GST${pricing.couponCode ? ` · coupon ${pricing.couponCode}` : ""}` : "—"}</Field>
            <Field label="Trial ends">{sub.trialEndsAt ? formatDate(sub.trialEndsAt) : "—"}</Field>
            <Field label="Current period">{sub.currentPeriodStart && sub.currentPeriodEnd ? `${formatDate(sub.currentPeriodStart)} – ${formatDate(sub.currentPeriodEnd)}` : "—"}</Field>
            <Field label="Grace ends">{sub.graceEndsAt ? formatDate(sub.graceEndsAt) : "—"}</Field>
            <Field label="Scheduled change">{sub.pendingChange ? `${detail.pendingPlanName ?? sub.pendingChange.planId} (${sub.pendingChange.interval})${sub.pendingChange.effectiveAt ? ` on ${formatDate(sub.pendingChange.effectiveAt)}` : ""}` : "—"}</Field>
            <Field label="Razorpay subscription">{sub.provider?.subscriptionId ?? "—"}</Field>
            <Field label="Last payment">{sub.lastPayment ? `${formatMoney(sub.lastPayment.amount, sub.lastPayment.currency)} · ${formatDate(sub.lastPayment.at)}` : "—"}</Field>
            <Field label="Failed payments">{sub.dunning?.failedPayments ?? 0}</Field>
            <Field label="Billing details">{sub.billingDetails ? `${sub.billingDetails.legalName}${sub.billingDetails.gstin ? ` · ${sub.billingDetails.gstin}` : ""}` : "Not provided"}</Field>
          </dl>
          {row.implicit && <p className="mt-4 text-xs text-muted-foreground">No subscription is stored yet — this company is on the implied trial from its sign-up date until something changes it.</p>}
        </CardContent>
      </GlassCard>

      {detail.isPlatformOwner ? (
        <GlassCard interactive={false}>
          <CardContent>
            <p className="text-sm text-muted-foreground">The platform owner company is never billed.</p>
          </CardContent>
        </GlassCard>
      ) : (
        <SubscriptionActions
          companyId={row.companyId}
          companyName={row.name}
          status={row.status}
          complimentary={row.complimentary}
          planId={sub.planId}
          interval={sub.interval}
          hasRazorpay={Boolean(sub.provider?.subscriptionId)}
          cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
          plans={plans.map((p) => ({ id: p._id, name: p.name }))}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Subscription history</CardTitle>
            <CardDescription>Status and plan changes (what revenue analytics is built on).</CardDescription>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No history yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {events.map((e) => (
                  <li key={e._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
                      {e.planId && <span className="text-muted-foreground"> · {e.planId}{e.interval ? `/${e.interval}` : ""}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {e.mrr ? `MRR ${formatMoney(e.mrr, row.currency)} · ` : ""}
                      {formatDateTime(e.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="text-base">Audit</CardTitle>
            <CardDescription>Who changed this subscription, including webhooks and the daily job (&ldquo;system&rdquo;).</CardDescription>
          </CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {audit.map((a, i) => (
                  <li key={String(a._id ?? i)} className="space-y-0.5 py-2">
                    <p className="font-medium break-all">{a.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(a.at)} · {a.actorId === "system" ? "system" : `user ${a.actorId.slice(0, 8)}`}
                      {typeof a.details?.status === "string" ? ` · ${a.details.status}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </GlassCard>
      </div>
    </div>
  );
}
