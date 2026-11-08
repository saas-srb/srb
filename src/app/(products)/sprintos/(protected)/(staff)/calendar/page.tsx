import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { AlarmClock, CalendarClock, CalendarDays } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import CalendarView from "@/components/products/sprintos/timeline/CalendarView";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canViewAllProjects } from "@/lib/pms-roles";
import { getUpcomingDeadlines } from "@/lib/products/sprintos/timeline";

export default async function PmsCalendarPage() {
  const user = await getCurrentPmsUser();
  const restrictToEmployeeId =
    user && !canViewAllProjects(user) ? user.employeeId ?? "__none__" : undefined;

  const items = await getUpcomingDeadlines({ restrictToEmployeeId, days: 120 });
  const in7Date = new Date();
  in7Date.setDate(in7Date.getDate() + 7);
  const in7 = in7Date.toISOString().slice(0, 10);
  const overdue = items.filter((i) => i.overdue).length;
  const thisWeek = items.filter((i) => !i.overdue && i.date <= in7).length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SprintOS", href: "/sprintos" }, { label: "Calendar" }]}
        title={<>Calendar</>}
        description={<>Task due dates, milestones and project deadlines across the portfolio.</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Tracked Deadlines" value={items.length} accent icon={<CalendarDays className="size-4" />} />
        <KpiCard label="Overdue" value={overdue} tone={overdue > 0 ? "down" : undefined} icon={<AlarmClock className="size-4" />} />
        <KpiCard label="Due This Week" value={thisWeek} icon={<CalendarClock className="size-4" />} />
        <KpiCard label="Next 120 Days" value={items.filter((i) => !i.overdue).length} icon={<CalendarDays className="size-4" />} />
      </KpiGrid>

      <CalendarView items={items} />
      {items.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          No dated tasks, milestones or project deadlines yet.
        </p>
      )}
</PanelListFilters>
    </div>
  );
}
