import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import DashboardSection from "@/components/platform/panel/DashboardSection";
import { Clock, CalendarClock, CalendarDays, Coins } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { Button } from "@/components/ui/button";
import PmsDashboardFilters from "@/components/products/sprintos/PmsDashboardFilters";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import TimesheetLogger from "@/components/products/sprintos/timesheet/TimesheetLogger";
import TimesheetTable from "@/components/products/sprintos/timesheet/TimesheetTable";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { listEntries, serializeEntry, hoursSummary, hoursTrend, hoursByProject, hoursByTask } from "@/lib/products/sprintos/timesheets";
import { searchProjects } from "@/lib/products/sprintos/projects";
import { listTasks } from "@/lib/products/sprintos/tasks";
import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";

function parseDateParam(v: string | undefined, end = false): Date | undefined {
  if (!v) return undefined;
  const d = new Date(`${v}${end ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function MyTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; dateFrom?: string; dateTo?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentPmsUser();
  if (!user?.employeeId) return null;
  const employeeId = user.employeeId;

  const rangeParam: DateRangePreset =
    sp.range && isValidDateRangePreset(sp.range) ? sp.range : sp.dateFrom || sp.dateTo ? "custom" : "thisMonth";
  let from: Date | undefined;
  let to: Date | undefined;
  if (rangeParam === "custom") {
    from = parseDateParam(sp.dateFrom);
    to = parseDateParam(sp.dateTo, true);
  } else {
    const r = resolveDateRangePreset(rangeParam)!;
    from = r.from;
    to = r.to;
  }
  const dateFrom = (from ?? new Date()).toISOString().slice(0, 10);
  const dateTo = (to ?? new Date()).toISOString().slice(0, 10);
  const range = { dateFrom, dateTo };

  const [entries, myProjects, summary, trend, byProject, byTask] = await Promise.all([
    listEntries({ employeeId, dateFrom, dateTo }),
    searchProjects({ restrictToEmployeeId: employeeId, pageSize: 100 }),
    hoursSummary(employeeId, range),
    hoursTrend(employeeId, range),
    hoursByProject(employeeId, range),
    hoursByTask({ employeeId, dateFrom, dateTo }),
  ]);

  const projectName = new Map(myProjects.items.map((p) => [p._id, p.name]));
  const taskList = await Promise.all(
    myProjects.items.map(async (p) => ({ project: p, tasks: await listTasks(p._id, { includeSubtasks: true }) }))
  );
  const taskTitle = new Map<string, string>();
  const projectOptions = taskList.map(({ project, tasks }) => {
    tasks.forEach((t) => taskTitle.set(t._id, t.title));
    return { _id: project._id, name: project.name, tasks: tasks.map((t) => ({ _id: t._id, title: t.title })) };
  });

  const rows = entries.map((e) => ({
    ...serializeEntry(e),
    projectName: projectName.get(e.projectId) ?? "Unknown project",
    taskTitle: e.taskId ? taskTitle.get(e.taskId) ?? null : null,
  }));

  const billableSplit = [
    { label: "Billable", value: summary.billable },
    { label: "Non-billable", value: summary.nonBillable },
  ];

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SprintOS", href: "/sprintos/me" }, { label: "Timesheet" }]}
        title={<>Timesheet</>}
        description={<>Log your work hours and track them against your projects.</>}
        actions={<><TimesheetLogger
          projects={projectOptions}
          trigger={<Button type="button" size="sm"><Clock className="size-3.5" data-icon="inline-start" />Log Hours</Button>}
        /></>}
      />

      <PmsDashboardFilters
        range={rangeParam}
        dateFrom={dateFrom}
        dateTo={dateTo}
        hasActiveFilters={Boolean(sp.range || sp.dateFrom || sp.dateTo)}
      />

      <KpiGrid>
        <KpiCard label="Today" value={summary.today} suffix="h" accent icon={<Clock className="size-4" />} />
        <KpiCard label="This Week" value={summary.week} suffix="h" icon={<CalendarClock className="size-4" />} />
        <KpiCard label="This Month" value={summary.month} suffix="h" icon={<CalendarDays className="size-4" />} />
        <KpiCard label="Billable (range)" value={summary.billable} suffix="h" icon={<Coins className="size-4" />} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Daily Hours</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={trend} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Project-wise Hours</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={byProject} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Task-wise Hours</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={byTask.slice(0, 12)} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Billable vs Non-Billable</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={billableSplit} /></CardContent>
        </GlassCard>
      </div>

      <DashboardSection>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Entries</h2>
        <TimesheetTable entries={rows} projects={projectOptions} />
      </DashboardSection>
    </div>
  );
}
