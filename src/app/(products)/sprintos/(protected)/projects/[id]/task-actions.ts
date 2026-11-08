"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageProjects, isPmsAdmin } from "@/lib/pms-roles";
import { getProject } from "@/lib/products/sprintos/projects";
import { checkProjectAccess } from "@/lib/products/sprintos/access";
import {
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  getTask,
  recomputeProjectProgress,
} from "@/lib/products/sprintos/tasks";
import { addComment, deleteComment } from "@/lib/products/sprintos/task-comments";
import { validateTask } from "@/lib/products/sprintos/validation";
import { isValidTaskStatus, getTaskStatusMeta, isTaskDone } from "@/lib/products/sprintos/constants";
import { recordActivity, diffSummary } from "@/lib/products/sprintos/activity";
import { notifyEmployees } from "@/lib/products/sprintos/notifications";
import { writeBlockReason } from "@/lib/platform/billing/enforce";

export interface TaskActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireManage() {
  const user = await getCurrentPmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageProjects(user)) throw new Error("Forbidden");
  return user;
}

function revalidateTask(projectId: string, taskId?: string) {
  revalidatePath(`/sprintos/projects/${projectId}`);
  revalidatePath(`/sprintos/projects/${projectId}/board`);
  revalidatePath(`/sprintos/projects/${projectId}/tasks`);
  revalidatePath("/sprintos/me");
  revalidatePath("/sprintos");
  if (taskId) revalidatePath(`/sprintos/projects/${projectId}/tasks/${taskId}`);
}

export async function saveTaskAction(
  projectId: string,
  input: Record<string, unknown>,
  taskId?: string
): Promise<TaskActionResult> {
  const user = await requireManage();
  const readOnly = await writeBlockReason();
  if (readOnly) return { ok: false, error: readOnly };
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  const v = validateTask(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (taskId) {
    const before = await getTask(taskId);
    if (!before || before.projectId !== projectId) return { ok: false, error: "Task not found." };
    const updated = await updateTask(taskId, v.data, user.id);
    await recordActivity({
      actorId: user.id,
      actorEmail: user.email,
      action: "update",
      entity: "task",
      entityId: taskId,
      entityLabel: v.data.title,
      projectId,
      summary: diffSummary(
        { status: before.status, assignee: before.assigneeId, priority: before.priority, due: before.dueDate },
        { status: v.data.status, assignee: v.data.assigneeId, priority: v.data.priority, due: v.data.dueDate },
        ["status", "assignee", "priority", "due"]
      ),
    });
    await recomputeProjectProgress(projectId);
    if (v.data.assigneeId && v.data.assigneeId !== before.assigneeId) {
      await notifyEmployees([v.data.assigneeId], (uid) => ({
        recipientUserId: uid,
        type: "task_assigned",
        title: `You were assigned: ${v.data.title}`,
        body: `${project.name} · ${before.taskCode}`,
        link: `/sprintos/projects/${projectId}/tasks/${taskId}`,
        projectId,
      }), user.id);
    }
    if (isTaskDone(v.data.status) && !isTaskDone(before.status) && project.projectManagerId) {
      await notifyEmployees([project.projectManagerId], (uid) => ({
        recipientUserId: uid,
        type: "task_completed",
        title: `Task completed: ${v.data.title}`,
        body: `${project.name} · ${before.taskCode}`,
        link: `/sprintos/projects/${projectId}/tasks/${taskId}`,
        projectId,
      }), user.id);
    }
    revalidateTask(projectId, taskId);
    return { ok: true, id: updated?._id };
  }

  const created = await createTask(projectId, v.data, user.id);
  if (created.assigneeId) {
    await notifyEmployees([created.assigneeId], (uid) => ({
      recipientUserId: uid,
      type: "task_assigned",
      title: `You were assigned: ${created.title}`,
      body: `${project.name} · ${created.taskCode}`,
      link: `/sprintos/projects/${projectId}/tasks/${created._id}`,
      projectId,
    }), user.id);
  }
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "task",
    entityId: created._id,
    entityLabel: `${created.taskCode} · ${v.data.title}`,
    projectId,
  });
  await recomputeProjectProgress(projectId);
  revalidateTask(projectId, created._id);
  return { ok: true, id: created._id };
}

export async function moveTaskAction(
  projectId: string,
  taskId: string,
  status: string,
  beforeKey: number | null,
  afterKey: number | null
): Promise<TaskActionResult> {
  const user = await requireManage();
  if (!isValidTaskStatus(status)) return { ok: false, error: "Unknown status." };
  const before = await getTask(taskId);
  if (!before || before.projectId !== projectId) return { ok: false, error: "Task not found." };

  const moved = await moveTask(taskId, status, beforeKey, afterKey, user.id);
  if (before.status !== status) {
    await recordActivity({
      actorId: user.id,
      actorEmail: user.email,
      action: "move",
      entity: "task",
      entityId: taskId,
      entityLabel: before.title,
      projectId,
      summary: `${getTaskStatusMeta(before.status).label} → ${getTaskStatusMeta(status).label}`,
    });
    await recomputeProjectProgress(projectId);
    if (isTaskDone(status) && !isTaskDone(before.status)) {
      const project = await getProject(projectId);
      if (project?.projectManagerId) {
        await notifyEmployees([project.projectManagerId], (uid) => ({
          recipientUserId: uid,
          type: "task_completed",
          title: `Task completed: ${before.title}`,
          body: `${project.name} · ${before.taskCode}`,
          link: `/sprintos/projects/${projectId}/tasks/${taskId}`,
          projectId,
        }), user.id);
      }
    }
  }
  revalidateTask(projectId, taskId);
  return { ok: true, id: moved?._id };
}

export async function setTaskStatusAction(
  projectId: string,
  taskId: string,
  status: string
): Promise<TaskActionResult> {
  const user = await getCurrentPmsUser();
  if (!user) return { ok: false, error: "Unauthorized." };
  if (!isValidTaskStatus(status)) return { ok: false, error: "Unknown status." };
  const before = await getTask(taskId);
  if (!before || before.projectId !== projectId) return { ok: false, error: "Task not found." };

  // Staff can set any task's status; an employee only on a project they belong to.
  const access = await checkProjectAccess(user, projectId);
  if (!access.allowed) return { ok: false, error: "You’re not assigned to this project." };
  if (before.status === status) return { ok: true, id: taskId };

  await updateTask(taskId, { status }, user.id);
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "status_change",
    entity: "task",
    entityId: taskId,
    entityLabel: before.title,
    projectId,
    summary: `${getTaskStatusMeta(before.status).label} → ${getTaskStatusMeta(status).label}`,
  });
  await recomputeProjectProgress(projectId);
  revalidateTask(projectId, taskId);
  return { ok: true, id: taskId };
}

export async function deleteTaskAction(projectId: string, taskId: string): Promise<TaskActionResult> {
  const user = await requireManage();
  const before = await getTask(taskId);
  if (!before || before.projectId !== projectId) return { ok: false, error: "Task not found." };
  await deleteTask(taskId, user.id);
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    entity: "task",
    entityId: taskId,
    entityLabel: before.title,
    projectId,
  });
  await recomputeProjectProgress(projectId);
  revalidateTask(projectId);
  return { ok: true };
}

export async function addTaskCommentAction(
  projectId: string,
  taskId: string,
  body: string
): Promise<TaskActionResult> {
  const user = await getCurrentPmsUser();
  if (!user) throw new Error("Unauthorized");
  const text = String(body ?? "").trim();
  if (!text) return { ok: false, error: "Comment can’t be empty." };
  if (text.length > 4000) return { ok: false, error: "Comment is too long." };

  const task = await getTask(taskId);
  if (!task || task.projectId !== projectId) return { ok: false, error: "Task not found." };
  if (!(await checkProjectAccess(user, projectId)).allowed) return { ok: false, error: "Forbidden." };

  await addComment({ taskId, projectId, authorId: user.id, authorEmail: user.email, body: text });

  const project = await getProject(projectId);
  const targets = [task.assigneeId, project?.projectManagerId ?? null].filter((x): x is string => Boolean(x));
  if (targets.length > 0) {
    await notifyEmployees(targets, (uid) => ({
      recipientUserId: uid,
      type: "comment_added",
      title: `New comment on ${task.taskCode}`,
      body: `${user.email}: ${text.slice(0, 120)}`,
      link: `/sprintos/projects/${projectId}/tasks/${taskId}`,
      projectId,
    }), user.id);
  }
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "comment",
    entity: "task_comment",
    entityId: taskId,
    entityLabel: task.title,
    projectId,
  });
  revalidateTask(projectId, taskId);
  return { ok: true };
}

export async function deleteTaskCommentAction(
  projectId: string,
  taskId: string,
  commentId: string
): Promise<TaskActionResult> {
  const user = await getCurrentPmsUser();
  if (!user) throw new Error("Unauthorized");
  const result = await deleteComment(commentId, user.id, isPmsAdmin(user));
  if (!result.ok) return { ok: false, error: "Could not delete comment." };
  revalidateTask(projectId, taskId);
  return { ok: true };
}
