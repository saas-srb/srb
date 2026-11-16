import type { Metadata } from "next";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import SetupView from "@/components/setup/SetupView";
import { requireWorkspaceAccess, getWorkspaceNav } from "@/lib/products/commandos/access";
import { getSetupProgress } from "@/lib/platform/setup-progress";
import { listSnapshots, recordSnapshot } from "@/lib/platform/setup-progress/store";
import { readSetupFilter } from "@/lib/platform/setup-progress/filter";
import { MODULES } from "@/lib/platform/onboarding/catalog";
import { notApplicableStepAction, reviewStepAction } from "./actions";

export const metadata: Metadata = { title: "Setup progress", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** The one setup percentage: what is done, what is left, and one button for each step. */
export default async function SetupProgressPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireWorkspaceAccess("company.progress");
  const filter = readSetupFilter(await searchParams);
  const [progress, session] = await Promise.all([getSetupProgress({ fresh: true }), getWorkspaceNav()]);
  await recordSnapshot(progress.summary.percent).catch(() => {});
  const trend = await listSnapshots(14).catch(() => []);
  const names = Object.fromEntries(MODULES.map((m) => [m.key as string, m.label]));
  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-6">
        <PanelPageHeader breadcrumbs={[{ label: "Organization Setup" }, { label: "Setup progress" }]} title={<>Setup progress</>} description={<>Complete when all steps that apply to you are done.</>} />
        <SetupView progress={progress} filter={filter} trend={trend} allowed={new Set(session?.nav.allowed ?? [])} canMark handlers={{ review: reviewStepAction, notApplicable: notApplicableStepAction }} productNames={names} />
      </div>
    </div>
  );
}
