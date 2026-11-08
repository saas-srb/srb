import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { FolderKanban, Clock, Rocket } from "lucide-react";
import MyProjectsView from "@/components/products/sprintos/MyProjectsView";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { getEmployeeDashboard } from "@/lib/products/sprintos/employee-dashboard";
import { ACTIVE_PROJECT_STATUSES } from "@/lib/products/sprintos/constants";

export default async function MyProjectsPage() {
  const user = await getCurrentPmsUser();
  if (!user?.employeeId) return null;

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const d = await getEmployeeDashboard(user.employeeId, { dateFrom: monthAgo.toISOString().slice(0, 10), dateTo: today });

  const active = d.projects.filter((p) => (ACTIVE_PROJECT_STATUSES as string[]).includes(p.status)).length;
  const myHours = Math.round(d.projects.reduce((s, p) => s + p.myLoggedHours, 0) * 10) / 10;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SprintOS", href: "/sprintos/me" }, { label: "My Projects" }]}
        title={<>My Projects</>}
        description={<>Projects you’re assigned to or manage.</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Assigned Projects" value={d.projects.length} accent icon={<FolderKanban className="size-4" />} />
        <KpiCard label="Active" value={active} icon={<Rocket className="size-4" />} />
        <KpiCard label="My Logged Hours" value={myHours} suffix="h" icon={<Clock className="size-4" />} />
      </KpiGrid>

      <MyProjectsView projects={d.projects} />
</PanelListFilters>
    </div>
  );
}
