"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { useStripDismiss, StripDismissButton } from "@/lib/platform/use-strip-dismiss";

/**
 * The slim "Finish setup" strip: shown to a Director on every Workspace page until setup is 100%, driven by the ONE setup percentage (Setup progress).
 * Not on the Setup progress page itself or the Company setup wizard.
 */
export default function SetupBanner({ percent, done, total, initiallyDismissed = false }: { percent: number; done: number; total: number; initiallyDismissed?: boolean }) {
  const path = usePathname();
  const { isDismissed, dismiss } = useStripDismiss("setup", "Finish setup", undefined, initiallyDismissed);
  if (isDismissed || path.startsWith("/commandos/onboarding") || path.startsWith("/commandos/setup")) return null;
  return (
    <div id="setup-banner" role="status" title={`${done} of ${total} setup steps done`} className="inline-flex max-w-full shrink-0 items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 py-1 pl-3 pr-1.5 text-xs backdrop-blur-md dark:border-border dark:bg-card">
      <span className="font-semibold text-foreground">Finish setup</span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-amber-500/25" aria-hidden><span className="block h-full rounded-full bg-amber-500" style={{ width: `${percent}%` }} /></span>
        {percent}%
      </span>
      <Link href="/commandos/setup" id="setup-banner-link" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-bold text-primary-foreground transition-colors hover:bg-primary/90">
        View <ArrowUpRight className="size-3" />
      </Link>
      <StripDismissButton onDismiss={dismiss} label="Finish setup" />
    </div>
  );
}
