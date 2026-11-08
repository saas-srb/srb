import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { getPlan, getStandardPlans } from "@/lib/platform/billing/plans";
import { razorpayConfigured } from "@/lib/platform/billing/razorpay";
import { hasLiveSubscription } from "@/lib/platform/billing/subscriptions";
import type { PlanOption } from "@/lib/platform/billing/billing-details";
import { planPrice } from "@/lib/platform/billing/pricing";
import BillingManager, { type BillingView } from "@/components/platform/billing/BillingManager";
import PlanChooser from "@/components/billing/PlanChooser";
import UsageMeters from "@/components/billing/UsageMeters";
import { buildShowcase } from "@/lib/platform/billing/showcase";
import { getUsageSummary } from "@/lib/platform/billing/usage-summary";
import { describeOverrides } from "@/lib/platform/billing/overrides";
import { downgradeGuarded } from "@/lib/platform/billing/plan-order-rule";
import {
  cancelSubscriptionAction,
  changePlanAction,
  confirmCheckoutAction,
  quoteAction,
  resumeSubscriptionAction,
  saveBillingDetailsAction,
  startCheckoutAction,
} from "./actions";

export const metadata: Metadata = { title: "Plan & billing", robots: { index: false, follow: false } };

function Shell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
<PanelPageHeader breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: title }]} title={<>{title}</>} description={<>{description}</>} />
<div className="mx-auto max-w-7xl space-y-4">
        {children}
      </div>
</div>
    </div>
  );
}

export default async function BillingSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
  const companyId = await currentCompanyId();
  const sub = await getCompanySubscription(companyId);

  if (!sub || (sub.status === "internal" && !sub.complimentary)) {
    return (
      <Shell title="Plan & billing" description="Subscription and invoices for this workspace.">
        <GlassCard>
          <CardContent>
            <p className="flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              Your workspace runs the platform — no subscription. Every product is included, with no limits and no charges.
            </p>
          </CardContent>
        </GlassCard>
      </Shell>
    );
  }

  const [entitlements, plans, currentPlan, pendingPlan, configured] = await Promise.all([
    getEntitlements(),
    // The five plans, always (a plan switched off in the catalogue still shows with its built-in terms).
    getStandardPlans(),
    getPlan(sub.planId),
    sub.pendingChange ? getPlan(sub.pendingChange.planId) : Promise.resolve(null),
    razorpayConfigured(),
  ]);
  const pricing = sub.pricing && sub.pricing.planId === sub.planId && sub.pricing.interval === sub.interval ? sub.pricing : null;

  const usageRows = await getUsageSummary().catch(() => []);
  const showcase = buildShowcase(plans).filter((p) => p.id !== "enterprise");
  const perksOf = (sp: (typeof showcase)[number] | undefined) =>
    sp ? [{ label: "Users", value: sp.seats === null ? "Unlimited" : sp.seats === 1 ? "1" : `Up to ${sp.seats.toLocaleString("en-IN")}` }, ...sp.limits.filter((l) => l.included).map((l) => ({ label: l.short, value: l.shortValue }))] : [];
  const options: PlanOption[] = plans.filter((p) => !p.lifetimeFree && !p.contactSales).map((p) => ({
    id: p._id,
    name: p.name,
    description: p.description,
    currency: p.currency,
    priceMonthly: planPrice(p, "monthly"),
    priceYearly: planPrice(p, "yearly"),
    perks: perksOf(showcase.find((x) => x.id === p._id)),
  }));

  const view: BillingView = {
    configured,
    // Entitlements apply time-based transitions (expired trial/grace) before the daily sweep persists them.
    status: entitlements.status,
    planId: sub.planId,
    planName: sub.status === "internal" ? "Complimentary" : (currentPlan?.name ?? sub.planId),
    interval: sub.interval,
    trialDaysLeft: entitlements.trialDaysLeft,
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    graceEndsAt: sub.graceEndsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    hasLive: hasLiveSubscription(sub),
    chargedPerCycle: pricing ? { total: pricing.total, currency: pricing.currency, couponCode: pricing.couponCode } : null,
    pendingChange: sub.pendingChange
      ? { planId: sub.pendingChange.planId, planName: pendingPlan?.name ?? sub.pendingChange.planId, interval: sub.pendingChange.interval, effectiveAt: sub.pendingChange.effectiveAt?.toISOString() ?? null }
      : null,
    billingDetails: sub.billingDetails ?? null,
    blockDowngrade: downgradeGuarded(entitlements.status),
    autopay: Boolean(sub.provider?.subscriptionId),
    lastPayment: sub.lastPayment ? { amount: sub.lastPayment.amount, currency: sub.lastPayment.currency, at: sub.lastPayment.at.toISOString() } : null,
  };

  const custom = describeOverrides(sub.overrides, currentPlan?.limits, entitlements.limits);

  return (
    <Shell title="Plan & billing" description="Your plan, what you have used, and the details printed on your GST invoices.">
      {custom.length > 0 && (
        <GlassCard interactive={false} containerClassName="h-auto">
          <CardHeader>
            <CardTitle className="text-base">Adjusted for your workspace</CardTitle>
            <CardDescription>SelfRun has changed these for you on top of your plan. They are already in effect.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {custom.map((line) => <li key={line} className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />{line}</li>)}
            </ul>
          </CardContent>
        </GlassCard>
      )}
      <BillingManager
        view={view}
        plans={options}
        plansSlot={<PlanChooser plans={showcase} currentPlanId={sub.planId} interval={sub.interval} blockDowngrade={downgradeGuarded(entitlements.status)} allowCurrent={entitlements.status === "trialing" && !hasLiveSubscription(sub)} />}
        usageSlot={usageRows.length > 0 ? <UsageMeters rows={usageRows} /> : null}
        actions={{
          quote: quoteAction,
          saveDetails: saveBillingDetailsAction,
          startCheckout: startCheckoutAction,
          confirmCheckout: confirmCheckoutAction,
          changePlan: changePlanAction,
          cancel: cancelSubscriptionAction,
          resume: resumeSubscriptionAction,
        }}
      />
    </Shell>
  );
}
