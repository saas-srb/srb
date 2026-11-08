import type { Metadata } from "next";
import BrandBackdrop from "@/components/ui/BrandBackdrop";
import ArcadeStage from "@/components/game/ArcadeStage";
import MaintenanceCountdown from "@/components/platform/MaintenanceCountdown";
import { getEffectiveMaintenance } from "@/lib/platform/maintenance-state";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";

/**
 * What every company's website and products show during a platform maintenance window in "takeover" mode (the proxy rewrites page views to
 * it, answering 503 so search engines retry). The company's own logo, name and colours, an animated scene, the platform's message and a
 * live countdown; when the window ends the proxy simply stops rewriting and the countdown reloads into the real site.
 */
export const metadata: Metadata = { title: "Back soon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PlatformMaintenancePage() {
  const m = await getEffectiveMaintenance(await currentCompanyIdOrNull());
  const message = m.message || "We’re making things better and will be back shortly. Thanks for your patience.";
  return (
    <main className="fixed inset-0 z-[9999] isolate flex overflow-y-auto bg-background px-4 py-4 sm:px-6">
      <BrandBackdrop />
      <div className="m-auto w-full">
        <ArcadeStage code="BRB" chip="Scheduled maintenance" title="We’ll be right back" description={message} gamePage="maintenance">
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Back in</p>
            <MaintenanceCountdown endsAt={m.endsAt} />
            <p className="text-xs text-muted-foreground">This page reloads by itself when we are done.</p>
          </div>
        </ArcadeStage>
      </div>
    </main>
  );
}
