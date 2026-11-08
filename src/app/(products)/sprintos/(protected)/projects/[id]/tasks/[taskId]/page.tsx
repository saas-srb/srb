import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Clock, Paperclip, Tag, User } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { PriorityBadge, TaskStatusBadge } from "@/components/products/sprintos/StatusBadges";
import TaskDetailActions from "@/components/products/sprintos/tasks/TaskDetailActions";
import EmployeeTaskControls from "@/components/products/sprintos/tasks/EmployeeTaskControls";
import SubtaskList from "@/components/products/sprintos/tasks/SubtaskList";
import TaskComments from "@/components/products/sprintos/tasks/TaskComments";
import TaskAttachments from "@/components/products/sprintos/tasks/TaskAttachments";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageProjects, isPmsAdmin } from "@/lib/pms-roles";
import { checkProjectAccess } from "@/lib/products/sprintos/access";
import { getProject } from "@/lib/products/sprintos/projects";
import { getTask, listSubtasks, listProjectLabels, listTasks, serializeTask } from "@/lib/products/sprintos/tasks";
import { listComments, serializeComment } from "@/lib/products/sprintos/task-comments";
import { listAttachments, serializeAttachment } from "@/lib/products/sprintos/task-attachments";
import { availableEmployees } from "@/lib/products/sprintos/project-members";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  const [user, project, task] = await Promise.all([getCurrentPmsUser(), getProject(id), getTask(taskId)]);
  if (!project || !task || task.projectId !== id) notFound();
  if (user && !(await checkProjectAccess(user, id)).allowed) notFound();

  const canManage = user ? canManageProjects(user) : false;
  const admin = user ? isPmsAdmin(user) : false;

  const [subtasks, comments, employees, labels, parent, attachments, projectTasks] = await Promise.all([
    listSubtasks(taskId),
    listComments(taskId),
    availableEmployees(),
    listProjectLabels(id),
    task.parentTaskId ? getTask(task.parentTaskId) : Promise.resolve(null),
    listAttachments(taskId),
    listTasks(id, { includeSubtasks: true }),
  ]);

  const empName = new Map(employees.map((e) => [e._id, e.name]));
  const serialized = serializeTask(task);
  const employeeOpts = employees.map((e) => ({ _id: e._id, name: e.name, employeeCode: e.employeeCode }));
  const timesheetProjects = [
    { _id: id, name: project.name, tasks: projectTasks.map((t) => ({ _id: t._id, title: t.title })) },
  ];
  const isPortalUser = Boolean(user?.employeeId) && !canManage;
  const canUpload = canManage || isPortalUser;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "SprintOS", href: "/sprintos" },
          { label: "Projects", href: "/sprintos/projects" },
          { label: project.name, href: `/sprintos/projects/${id}` },
          { label: "Tasks", href: `/sprintos/projects/${id}/tasks` },
          { label: task.taskCode },
        ]}
        title={<><span className="inline-flex flex-wrap items-center gap-2">{task.title}<PriorityBadge priority={task.priority} />
            <TaskStatusBadge status={task.status} /></span></>}
        description={<><span className="font-mono">{task.taskCode}</span>
            {parent && (
              <>
                {" · subtask of "}
                <Link href={`/sprintos/projects/${id}/tasks/${parent._id}`} className="hover:text-primary hover:underline">
                  {parent.title}
                </Link>
              </>
            )}</>}
        actions={<>{canManage ? (
          <TaskDetailActions
            task={serialized}
            employees={employeeOpts}
            labelSuggestions={labels}
            redirectOnDelete={`/sprintos/projects/${id}/tasks`}
          />
        ) : (
          isPortalUser && (
            <EmployeeTaskControls
              projectId={id}
              taskId={taskId}
              status={task.status}
              canUpdateStatus
              timesheetProjects={timesheetProjects}
            />
          )
        )}</>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <CardHeader><CardTitle>Description</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap text-muted-foreground">
            {task.description || "No description."}
          </CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2"><User className="size-3.5" /> {task.assigneeId ? empName.get(task.assigneeId) ?? "Unknown" : "Unassigned"}</p>
            <p className="flex items-center gap-2"><CalendarClock className="size-3.5" /> {task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No due date"}</p>
            {task.startDate && <p className="flex items-center gap-2"><CalendarClock className="size-3.5" /> Starts {formatDate(task.startDate)}</p>}
            {task.estimateHours != null && <p className="flex items-center gap-2"><Clock className="size-3.5" /> {task.estimateHours}h estimate</p>}
            {task.labels.length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5">
                <Tag className="size-3.5" />
                {task.labels.map((l) => (
                  <span key={l} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{l}</span>
                ))}
              </p>
            )}
            <p className="pt-1 text-xs">Created {formatDateTime(serialized.createdAt)}</p>
            {serialized.completedAt && <p className="text-xs">Completed {formatDateTime(serialized.completedAt)}</p>}
          </CardContent>
        </GlassCard>
      </div>

      {!task.parentTaskId && (
        <GlassCard>
          <CardHeader><CardTitle>Subtasks</CardTitle></CardHeader>
          <CardContent>
            <SubtaskList
              projectId={id}
              parentTaskId={taskId}
              subtasks={subtasks.map((s) => serializeTask(s))}
              employees={employeeOpts}
              labelSuggestions={labels}
              canManage={canManage}
              canToggle={canManage || isPortalUser}
            />
          </CardContent>
        </GlassCard>
      )}

      <GlassCard>
        <CardHeader><CardTitle className="flex items-center gap-2"><Paperclip className="size-4" /> Attachments ({attachments.length})</CardTitle></CardHeader>
        <CardContent>
          <TaskAttachments
            taskId={taskId}
            attachments={attachments.map((a) => serializeAttachment(a))}
            currentUserId={user?.id ?? ""}
            canUpload={canUpload}
            canManage={canManage}
          />
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader><CardTitle>Comments ({comments.length})</CardTitle></CardHeader>
        <CardContent>
          <TaskComments
            projectId={id}
            taskId={taskId}
            comments={comments.map((c) => serializeComment(c))}
            currentUserId={user?.id ?? ""}
            isAdmin={admin}
          />
        </CardContent>
      </GlassCard>
    </div>
  );
}
