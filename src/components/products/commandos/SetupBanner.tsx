"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { useStripDismiss, StripDismissButton } from "@/lib/platform/use-strip-dismiss";

/**
 * The "Complete setup" strip: shown to a company owner on every Workspace page
 * (the dashboard included) until setup is completed, whether or not it was
 * skipped. Not on the wizard itself.
 */
export default function SetupBanner({
  done,
  total,
  initiallyDismissed = false,
}: {
  done: number;
  total: number;
  initiallyDismissed?: boolean;
}) {
  const path = usePathname();
  const { isDismissed, dismiss } = useStripDismiss("setup", "Finish setup", undefined, initiallyDismissed);

  if (isDismissed || path.startsWith("/commandos/onboarding")) return null;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div
      id="setup-banner"
      role="status"
      title="Company profile, departments, team invites, branding and products"
      className="inline-flex max-w-full shrink-0 items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 dark:border-border dark:bg-card py-1 pl-3 pr-1.5 text-xs backdrop-blur-md"
    >
      <span className="font-semibold text-foreground">Finish setup</span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-amber-500/25" aria-hidden>
          <span className="block h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
        </span>
        {done}/{total}
      </span>
      <Link href="/commandos/onboarding" id="setup-banner-link" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-bold text-primary-foreground transition-colors hover:bg-primary/90">
        Complete <ArrowUpRight className="size-3" />
      </Link>
      <StripDismissButton onDismiss={dismiss} label="Finish setup" />
    </div>
  );
}
