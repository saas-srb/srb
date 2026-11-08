"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/platform/billing/types";
import type { UpgradeOffer } from "@/lib/platform/billing/upgrade-offer-rule";
import { useStripDismiss, StripDismissButton } from "@/lib/platform/use-strip-dismiss";

/**
 * The "Upgrade plan" strip: one step up from the plan the company is on (Free → Starter → Growth → Business), for its Directors, on every
 * Workspace and product page. It opens billing with that plan already chosen. Not on the billing pages themselves.
 */
export default function UpgradeBanner({
  offer,
  initiallyDismissed = false,
}: {
  offer: UpgradeOffer;
  initiallyDismissed?: boolean;
}) {
  const path = usePathname();
  const { isDismissed, dismiss } = useStripDismiss("upgrade", "Upgrade offer", undefined, initiallyDismissed);

  if (isDismissed || path.startsWith("/commandos/settings/billing")) return null;
  return (
    <div
      id="upgrade-banner"
      role="status"
      title={`Move up to ${offer.toName}: more people and bigger allowances for storage, AI, email and voice`}
      className="inline-flex max-w-full shrink-0 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 dark:border-border dark:bg-card py-1 pl-3 pr-1.5 text-xs backdrop-blur-md"
    >
      <Sparkles className="size-3.5 shrink-0 text-primary" />
      <span className="font-semibold text-foreground">{offer.fromName} plan</span>
      <span className="text-muted-foreground">· {offer.toName} from {formatMoney(offer.monthly, offer.currency)}/mo</span>
      <Link href={`/commandos/settings/billing?plan=${encodeURIComponent(offer.toId)}`} id="upgrade-banner-link" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-bold text-primary-foreground transition-colors hover:bg-primary/90">
        Upgrade to {offer.toName} <ArrowUpRight className="size-3" />
      </Link>
      <StripDismissButton onDismiss={dismiss} label="Upgrade offer" />
    </div>
  );
}
