"use client";

import type { BillingInterval } from "@/lib/platform/billing/types";
import type { ShowcasePlan } from "@/lib/platform/billing/showcase";
import PlanShowcase from "@/components/billing/PlanShowcase";

/** The in-app plan cards. Choosing one selects it and opens the Checkout step of the same page (`BillingManager`). */
export default function PlanChooser({ plans, currentPlanId, interval, blockDowngrade = true, allowCurrent = false }: { plans: ShowcasePlan[]; currentPlanId: string; interval: BillingInterval; blockDowngrade?: boolean; allowCurrent?: boolean }) {
  return (
    <PlanShowcase
      plans={plans}
      currentPlanId={currentPlanId}
      defaultInterval={interval}
      blockDowngrade={blockDowngrade}
      allowCurrent={allowCurrent}
      contactHref="/resolveiq"
      onSelect={(planId, iv) => {
        window.dispatchEvent(new CustomEvent("billing:select-plan", { detail: { planId, interval: iv } }));
      }}
    />
  );
}
