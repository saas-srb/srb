import { Badge } from "@/components/ui/badge";
import type { SubscriptionStatus } from "@/lib/platform/billing/types";

const LABEL: Record<SubscriptionStatus, string> = {
  internal: "Internal",
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  grace: "Grace period",
  suspended: "Suspended",
  canceled: "Canceled",
};

const STYLE: Record<SubscriptionStatus, string> = {
  internal: "bg-primary/10 text-primary",
  trialing: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  past_due: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  grace: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  suspended: "bg-destructive/15 text-destructive",
  canceled: "bg-muted text-muted-foreground",
};

export function subscriptionStatusLabel(status: SubscriptionStatus, complimentary?: boolean): string {
  return status === "internal" && complimentary ? "Complimentary" : LABEL[status];
}

export default function SubscriptionStatusBadge({ status, complimentary, cancelAtPeriodEnd }: { status: SubscriptionStatus; complimentary?: boolean; cancelAtPeriodEnd?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge className={STYLE[status]}>{subscriptionStatusLabel(status, complimentary)}</Badge>
      {cancelAtPeriodEnd && <Badge variant="outline">Ends at period end</Badge>}
    </span>
  );
}
