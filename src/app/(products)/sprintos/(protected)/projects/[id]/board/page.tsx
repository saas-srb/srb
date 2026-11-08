import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ProjectTabs from "@/components/products/sprintos/ProjectTabs";
import TaskBoard from "@/components/products/sprintos/tasks/TaskBoard";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageProjects } from "@/lib/pms-roles";
import { checkProjectAccess } from "@/lib/products/sprintos/access";
import { getProject } from "@/lib/products/sprintos/projects";
import { boardTasks, listProjectLabels, serializeTask } from "@/lib/products/sprintos/tasks";
import { availableEmployees } from "@/lib/products/sprintos/project-members";
import { TASK_STATUS_ORDER, type TaskStatus } from "@/lib/products/sprintos/constants";
import type { SerializedTask } from "@/lib/products/sprintos/tasks";

export default async function ProjectBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, project] = await Promise.all([getCurrentPmsUser(), getProject(id)]);
  if (!project) notFound();
  if (user && !(await checkProjectAccess(user, id)).allowed) notFound();
  const canManage = user ? canManageProjects(user) : false;

  const [board, employees, labels] = await Promise.all([
    boardTasks(id),
    availableEmployees(),
    listProjectLabels(id),
  ]);

  const serializedBoard = Object.fromEntries(
    TASK_STATUS_ORDER.map((s) => [s, board[s].map((t) => serializeTask(t))])
  ) as Record<TaskStatus, SerializedTask[]>;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "SprintOS", href: "/sprintos" },
          { label: "Projects", href: "/sprintos/projects" },
          { label: project.name, href: `/sprintos/projects/${id}` },
          { label: "Board" },
        ]}
        title={<>{project.name} · Board</>}
        actions={<><Link href={`/sprintos/projects/${id}/tasks`} className="text-sm font-medium text-primary hover:underline">
          List view →
        </Link></>}
      />
      <ProjectTabs projectId={id} />

      <TaskBoard
        projectId={id}
        board={serializedBoard}
        employees={employees.map((e) => ({ _id: e._id, name: e.name, employeeCode: e.employeeCode }))}
        labelSuggestions={labels}
        canManage={canManage}
      />
    </div>
  );
}
