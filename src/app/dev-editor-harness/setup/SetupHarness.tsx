"use client";

import SetupView from "@/components/setup/SetupView";
import SetupSummaryCard from "@/components/setup/SetupSummaryCard";
import SetupBanner from "@/components/products/commandos/SetupBanner";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import CompaniesGrid from "@/app/(platform)/console/companies/CompaniesGrid";
import type { SetupProgress } from "@/lib/platform/setup-progress/types";
import type { SetupFilter } from "@/lib/platform/setup-progress/filter";
import type { CompanyRow } from "@/lib/platform/console/companies";

const noop = async () => ({ ok: true });

/** Development-only (404 in production): the setup progress screens over SAMPLE data. No sign-in, no database. */
export default function SetupHarness({ view, progress, filter, names }: { view: string; progress: SetupProgress; filter: SetupFilter; names: Record<string, string> }) {
  if (view === "console") {
    const row = (id: string, name: string, percent: number | null, stuck: boolean): CompanyRow => ({ id, slug: id, name, status: "active", isPlatformOwner: false, ownerEmail: `owner@${id}.test`, ownerEmailVerified: true, userCount: 4, domains: [`${id}.example`], onboarding: { done: 2, total: 5, completedAt: null, dismissedAt: null }, setup: { percent, stuck }, createdAt: new Date("2026-10-01"), reactivationPending: false });
    const rows = [row("acme", "Acme Labs", 82, false), row("northwind", "Northwind", 34, true), row("globex", "Globex", 100, false), row("initech", "Initech", 46, false), row("umbrella", "Umbrella", null, false)];
    return <div className="mx-auto w-full min-w-0 max-w-6xl space-y-4 p-4"><PanelPageHeader title={<>Companies</>} description={<>Every company on the platform.</>} /><CompaniesGrid rows={rows} total={5} page={1} totalPages={1} filters={null} hasActiveFilters={false} /></div>;
  }
  if (view === "dashboard") {
    return <div className="mx-auto max-w-5xl space-y-4 p-4"><PanelPageHeader title={<>Good morning, Asha</>} description={<>Product performance across your workspace</>} /><SetupBanner percent={progress.summary.percent} done={progress.summary.done} total={progress.summary.applicable} /><SetupSummaryCard progress={progress} /><div className="h-40 rounded-2xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground">(the product performance matrix goes here)</div></div>;
  }
  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <PanelPageHeader breadcrumbs={[{ label: "Organization Setup" }, { label: "Setup progress" }]} title={<>Setup progress</>} description={<>Complete when all steps that apply to you are done.</>} />
        <SetupView progress={progress} filter={filter} trend={[{ day: "a", percent: 12 }, { day: "b", percent: 30 }, { day: "c", percent: progress.summary.percent }]} allowed={null} canMark handlers={{ review: noop, notApplicable: noop }} productNames={names} action="/dev-editor-harness/setup" />
      </div>
    </div>
  );
}
