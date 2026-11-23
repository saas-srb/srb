import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import MyTasksView from "@/components/products/sprintos/MyTasksView";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { tasksForAssignee } from "@/lib/products/sprintos/tasks";

export default async function MyTasksPage() {
  const user = await getCurrentPmsUser();
  if (!user?.employeeId) return null;

  const rows = await tasksForAssignee(user.employeeId, { includeDone: true });
  const projects = Array.from(new Map(rows.map((t) => [t.projectId, { _id: t.projectId, name: t.projectName }])).values());

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SprintOS", href: "/sprintos/me" }, { label: "My Tasks" }]}
        title={<>My Tasks</>}
        description={<>Every task assigned to you, across all projects. Open one to update it.</>}
      />

      <PanelListFilters>
<MyTasksView
        tasks={rows.map((t) => ({
          _id: t._id,
          taskCode: t.taskCode,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          projectId: t.projectId,
          projectName: t.projectName,
          projectCode: t.projectCode,
        }))}
        projects={projects}
      />
</PanelListFilters>
    </div>
  );
}
