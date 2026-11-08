import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ProjectTabs from "@/components/products/sprintos/ProjectTabs";
import TaskList from "@/components/products/sprintos/tasks/TaskList";
import TaskSheet from "@/components/products/sprintos/tasks/TaskSheet";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageProjects } from "@/lib/pms-roles";
import { checkProjectAccess } from "@/lib/products/sprintos/access";
import { getProject } from "@/lib/products/sprintos/projects";
import { listTasks, listProjectLabels, serializeTask } from "@/lib/products/sprintos/tasks";
import { availableEmployees } from "@/lib/products/sprintos/project-members";

export default async function ProjectTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, project] = await Promise.all([getCurrentPmsUser(), getProject(id)]);
  if (!project) notFound();
  if (user && !(await checkProjectAccess(user, id)).allowed) notFound();
  const canManage = user ? canManageProjects(user) : false;

  const [topTasks, allTasks, employees, labels] = await Promise.all([
    listTasks(id, {}),
    listTasks(id, { includeSubtasks: true }),
    availableEmployees(),
    listProjectLabels(id),
  ]);

  const subtaskCount = new Map<string, number>();
  for (const t of allTasks) {
    if (t.parentTaskId) subtaskCount.set(t.parentTaskId, (subtaskCount.get(t.parentTaskId) ?? 0) + 1);
  }

  const empName = new Map(employees.map((e) => [e._id, e.name]));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "SprintOS", href: "/sprintos" },
          { label: "Projects", href: "/sprintos/projects" },
          { label: project.name, href: `/sprintos/projects/${id}` },
          { label: "Tasks" },
        ]}
        title={<>{project.name} · Tasks</>}
        actions={<><div className="flex items-center gap-2">
          <Link href={`/sprintos/projects/${id}/board`} className="text-sm font-medium text-primary hover:underline">Board view →</Link>
          {canManage && (
            <TaskSheet
              projectId={id}
              employees={employees.map((e) => ({ _id: e._id, name: e.name, employeeCode: e.employeeCode }))}
              labelSuggestions={labels}
              trigger={
                <Button type="button" size="sm">
                  <Plus className="size-3.5" data-icon="inline-start" />
                  New Task
                </Button>
              }
            />
          )}
        </div></>}
      />
      <ProjectTabs projectId={id} />

      <TaskList
        projectId={id}
        tasks={topTasks.map((t) => ({
          ...serializeTask(t),
          assigneeName: t.assigneeId ? empName.get(t.assigneeId) ?? null : null,
          subtaskCount: subtaskCount.get(t._id) ?? 0,
        }))}
        labels={labels}
      />
    </div>
  );
}
