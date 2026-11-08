import { requireLmsPage } from "@/lib/lms-auth";
import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Users, DoorOpen, UserX, Sparkles } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { listLeadRecords, getLeadStats } from "@/lib/lead-management/records";
import { LEAD_WORKFLOWS, stageMeta } from "@/lib/lead-management/workflows";
import { LEAD_SOURCE_META } from "@/lib/lead-management/types";
import type { LeadType } from "@/lib/lead-management/types";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<LeadType, string> = {
  job_applicant: "Job Applicants",
  intern: "Interns",
  trainee: "Trainees",
  client: "Clients",
};

export default async function LeadsDashboardPage() {
  await requireLmsPage("VIEW_LEADS");
  const [stats, recent] = await Promise.all([getLeadStats(), listLeadRecords({ limit: 12 })]);

  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Lead Management" }]}
        title={<>Lead Management</>}
        description={<>Single source of truth for the external portal — every website submission, its journey, and its account.</>}
        actions={<><div className="flex gap-2">
          <Link href="/dealflow-ai/leads/list" className={buttonVariants({ variant: "outline", size: "sm" })}>
            All leads
          </Link>
          <Link href="/dealflow-ai/leads/new" className={buttonVariants({ size: "sm" })}>
            New lead
          </Link>
        </div></>}
      />

      <PanelListFilters>
<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total leads" value={stats.total} accent icon={<Users className="size-4" />} />
        <KpiCard label="Open" value={stats.open} icon={<DoorOpen className="size-4" />} />
        <KpiCard label="Unassigned" value={stats.unassigned} tone={stats.unassigned > 0 ? "down" : undefined} icon={<UserX className="size-4" />} />
        <KpiCard label="Won" value={(stats.byStage["joined"] ?? 0) + (stats.byStage["certificate_issued"] ?? 0) + (stats.byStage["support"] ?? 0)} icon={<Sparkles className="size-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader>
            <CardTitle className="text-base">By type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(Object.keys(TYPE_LABEL) as LeadType[]).map((t) => (
              <Link
                key={t}
                href={`/dealflow-ai/leads/list?type=${t}`}
                className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2 text-sm hover:border-primary/40"
              >
                <span className="text-foreground">{TYPE_LABEL[t]}</span>
                <span className="font-semibold text-muted-foreground">{stats.byType[t] ?? 0}</span>
              </Link>
            ))}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader>
            <CardTitle className="text-base">Pipeline snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(Object.keys(LEAD_WORKFLOWS) as LeadType[]).map((t) => {
              const stages = LEAD_WORKFLOWS[t].filter((s) => !s.terminal);
              const total = stages.reduce((n, s) => n + (stats.byStage[s.key] ?? 0), 0);
              if (total === 0) return null;
              return (
                <div key={t}>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">{TYPE_LABEL[t]}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {stages.map((s) => {
                      const c = stats.byStage[s.key] ?? 0;
                      if (!c) return null;
                      return (
                        <span key={s.key} className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-foreground">
                          {s.label} <span className="font-semibold">{c}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Recent leads</CardTitle>
          <Link href="/dealflow-ai/leads/list" className="text-sm font-medium text-primary hover:underline">
            View all →
          </Link>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Lead</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">Stage</th>
                <th className="py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((l) => (
                <tr key={l._id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3">
                    <Link href={`/dealflow-ai/leads/${l._id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                      {l.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{l.code} · {l.email}</span>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{TYPE_LABEL[l.type]}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{LEAD_SOURCE_META[l.source].label}</td>
                  <td className="py-2 pr-3 text-foreground">{stageMeta(l.type, l.stage)?.label ?? l.stage}</td>
                  <td className="py-2 text-muted-foreground">{formatDateTime(l.createdAt)}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No leads yet. They appear here automatically as visitors submit website forms.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
