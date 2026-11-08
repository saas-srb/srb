import PanelTabs from "@/components/platform/panel/PanelTabs";
import Link from "next/link";
import { redirect } from "next/navigation";
import SmmsFilterBar from "@/components/products/viralpulse-ai/SmmsFilterBar";
import { BarsChart } from "@/components/products/playbook-ai/SopCharts";
import ReportTable from "@/components/products/evaliq/ReportTable";
import { PageHeader, SectionCard, Stat } from "@/components/products/evaliq/OtsUi";
import { getViewer, can } from "@/lib/products/evaliq/viewer";
import { GROUP_BYS, groupAnalytics, type GroupBy } from "@/lib/products/evaliq/analytics";
import { getDirectory } from "@/lib/products/evaliq/people";
import { listTestOptions } from "@/lib/products/evaliq/tests";
import { CANDIDATE_KINDS, fmtDuration, fmtPct } from "@/lib/products/evaliq/constants";
import { cn } from "@/lib/utils";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  if (!can(viewer, "VIEW_REPORTS")) redirect("/evaliq");
  const sp = await searchParams;
  const groupBy = (GROUP_BYS.some((g) => g.value === sp.groupBy) ? sp.groupBy : "department") as GroupBy;
  const f = { from: sp.from, to: sp.to, testId: sp.testId, kind: sp.kind, departmentId: sp.departmentId, designationId: sp.designationId };
  const [rows, dir, tests] = await Promise.all([groupAnalytics(groupBy, f), getDirectory(), listTestOptions()]);
  const focus = sp.departmentId ? rows.find((r) => r.key === sp.departmentId) ?? null : null;
  const hrefWith = (patch: Record<string, string>) => `/evaliq/analytics?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter((e): e is [string, string] => !!e[1])), groupBy, ...patch })}`;
  const href = (g: string) => hrefWith({ groupBy: g });
  const label = GROUP_BYS.find((g) => g.value === groupBy)!.label;
  const deptLabel = sp.departmentId ? dir.departments.find((d) => d.value === sp.departmentId)?.label : null;

  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" crumbs={[{ label: "Analytics" }]} description="Department, role, designation, candidate type, batch and course analytics — people are grouped by their CURRENT department / role / batch in TalentOS and Cohort AI." />
      <PanelTabs label="Group by" active={groupBy} tabs={GROUP_BYS.map((g) => ({ key: g.value, label: `By ${g.label}`, href: href(g.value) }))} />
      <SmmsFilterBar
        values={{ from: sp.from ?? "", to: sp.to ?? "", testId: sp.testId ?? "", kind: sp.kind ?? "", departmentId: sp.departmentId ?? "", designationId: sp.designationId ?? "" }}
        fields={[
          { key: "from", label: "Assigned from", type: "date" },
          { key: "to", label: "Assigned to", type: "date" },
          { key: "testId", label: "Test", type: "select", options: tests },
          { key: "kind", label: "User type", type: "select", options: CANDIDATE_KINDS.map((k) => ({ value: k.value, label: k.label })) },
          { key: "departmentId", label: "Department", type: "select", options: dir.departments },
          { key: "designationId", label: "Role", type: "select", options: dir.designations },
        ]}
      />
      {deptLabel && (
        <SectionCard title={deptLabel} description="Everyone currently in this department">
          {(() => {
            const all = rows.reduce(
              (acc, r) => ({ assigned: acc.assigned + r.assigned, completed: acc.completed + r.completed, pending: acc.pending + r.pending + r.inProgress, graded: acc.graded + r.graded, passed: acc.passed + r.passed }),
              { assigned: 0, completed: 0, pending: 0, graded: 0, passed: 0 }
            );
            const src = focus ?? null;
            return (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                <Stat label="Assigned tests" value={all.assigned} />
                <Stat label="Completed" value={all.completed} />
                <Stat label="Pending" value={all.pending} />
                <Stat label="Average score" value={src?.avgScore ?? "—"} />
                <Stat label="Pass rate" value={fmtPct(all.graded ? (all.passed / all.graded) * 100 : null)} tone="ok" />
                <Stat label="Failure rate" value={fmtPct(all.graded ? ((all.graded - all.passed) / all.graded) * 100 : null)} tone="danger" />
                <Stat label="Avg completion" value={fmtDuration(src?.avgTimeSec ?? null)} />
              </div>
            );
          })()}
        </SectionCard>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`Average % by ${label}`}>
          <BarsChart data={rows.filter((r) => r.avgPercentage !== null).map((r) => ({ key: r.key, label: r.label, value: r.avgPercentage ?? 0, href: groupBy === "department" && r.key !== "none" ? hrefWith({ groupBy: "designation", departmentId: r.key }) : undefined }))} suffix="%" max={100} emptyLabel="No scored results yet." />
        </SectionCard>
        <SectionCard title={`Pass rate by ${label}`}>
          <BarsChart data={rows.filter((r) => r.passRate !== null).map((r) => ({ key: r.key, label: r.label, value: r.passRate ?? 0 }))} suffix="%" max={100} emptyLabel="No scored results yet." />
        </SectionCard>
      </div>
      <SectionCard title={`By ${label}`} description={groupBy === "department" ? "Click a bar in the chart to drill into that department's roles." : undefined}>
        <ReportTable
          report={{
            title: label,
            columns: [
              { header: label, key: "label" },
              { header: "People", key: "people", numeric: true },
              { header: "Assigned", key: "assigned", numeric: true },
              { header: "Completed", key: "completed", numeric: true },
              { header: "Pending", key: "pending", numeric: true },
              { header: "In Progress", key: "inProgress", numeric: true },
              { header: "Expired", key: "expired", numeric: true },
              { header: "Avg Score", key: "avgScore", numeric: true },
              { header: "Avg %", key: "avgPercentage", numeric: true },
              { header: "Pass Rate %", key: "passRate", numeric: true },
              { header: "Fail Rate %", key: "failRate", numeric: true },
              { header: "Avg Time", key: "time", numeric: true },
            ],
            rows: rows.map((r) => ({ ...r, time: fmtDuration(r.avgTimeSec) })),
          }}
        />
      </SectionCard>
    </div>
  );
}
