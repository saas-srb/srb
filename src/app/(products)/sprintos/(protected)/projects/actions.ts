"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { checkProjectAccess } from "@/lib/products/sprintos/access";
import { pmsCan, pmsSeesAll } from "@/lib/pms-access";
import {
  createProject,
  updateProject,
  deleteProject,
  changeProjectStatus,
  getProject,
} from "@/lib/products/sprintos/projects";
import { validateProject } from "@/lib/products/sprintos/validation";
import { isValidProjectStatus, getProjectStatusMeta } from "@/lib/products/sprintos/constants";
import { recordActivity, diffSummary } from "@/lib/products/sprintos/activity";
import { listProjectMembers } from "@/lib/products/sprintos/project-members";
import { notifyEmployees } from "@/lib/products/sprintos/notifications";
import { writeBlockReason } from "@/lib/platform/billing/enforce";

export interface ProjectActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireManage(projectId?: string) {
  const user = await getCurrentPmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!pmsCan(user, "projects.manage")) throw new Error("Forbidden");
  // A manager manages only the projects they manage or belong to (everyone's scope: any); the action cannot be pointed at a stranger's project by id.
  if (projectId && !(await checkProjectAccess(user, projectId)).allowed) throw new Error("Forbidden");
  return user;
}

/** Best-effort: keep the Messenger project channel + membership in sync. Never throws. */
async function syncMessengerChannel(projectId: string): Promise<void> {
  try {
    const { syncProjectChannel } = await import("@/lib/products/huddle-ai/projects");
    await syncProjectChannel(projectId);
  } catch {
    // Messenger integration is optional — a failure here must not affect PMS.
  }
}

function revalidate(id?: string) {
  revalidatePath("/sprintos/projects");
  revalidatePath("/sprintos");
  if (id) {
    revalidatePath(`/sprintos/projects/${id}`);
    revalidatePath(`/sprintos/projects/${id}/edit`);
  }
}

export async function saveProjectAction(
  input: Record<string, unknown>,
  id?: string
): Promise<ProjectActionResult> {
  const user = await requireManage(id);
  const readOnly = await writeBlockReason();
  if (readOnly) return { ok: false, error: readOnly };
  const v = validateProject(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (id) {
    const before = await getProject(id);
    if (!before) return { ok: false, error: "Project not found." };
    // Status changes go through the guarded path.
    const { status, ...rest } = v.data;
    if (status !== before.status) {
      const res = await changeProjectStatus(id, status, user.id);
      if (!res.ok) return { ok: false, error: res.reason };
    }
    const updated = await updateProject(id, rest, user.id);
    await recordActivity({
      actorId: user.id,
      actorEmail: user.email,
      action: "update",
      entity: "project",
      entityId: id,
      entityLabel: v.data.name,
      projectId: id,
      summary: diffSummary(
        { name: before.name, priority: before.priority, progress: before.progressPercent, pm: before.projectManagerId },
        { name: v.data.name, priority: v.data.priority, progress: v.data.progressPercent, pm: v.data.projectManagerId },
        ["name", "priority", "progress", "pm"]
      ),
    });
    await syncMessengerChannel(id);
    revalidate(id);
    return { ok: true, id: updated?._id };
  }

  const created = await createProject(v.data, user.id);
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "project",
    entityId: created._id,
    entityLabel: `${created.projectCode} · ${v.data.name}`,
    projectId: created._id,
  });
  await syncMessengerChannel(created._id);
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function changeStatusAction(id: string, status: string): Promise<ProjectActionResult> {
  const user = await requireManage(id);
  if (!isValidProjectStatus(status)) return { ok: false, error: "Unknown status." };
  const before = await getProject(id);
  const res = await changeProjectStatus(id, status, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "status_change",
    entity: "project",
    entityId: id,
    entityLabel: res.project.name,
    projectId: id,
    summary: `status: ${before?.status ?? "?"} → ${status}`,
  });

  const members = await listProjectMembers(id);
  const recipients = Array.from(
    new Set([...members.map((m) => m.employeeId), res.project.projectManagerId].filter((x): x is string => Boolean(x)))
  );
  if (recipients.length > 0) {
    await notifyEmployees(recipients, (uid) => ({
      recipientUserId: uid,
      type: "project_status_changed",
      title: `${res.project.name} is now ${getProjectStatusMeta(status).label}`,
      body: `Changed by ${user.email}`,
      link: `/sprintos/projects/${id}`,
      projectId: id,
    }), user.id);
  }

  await syncMessengerChannel(id);
  revalidate(id);
  return { ok: true, id };
}

export async function updateProgressAction(id: string, progressPercent: number): Promise<ProjectActionResult> {
  const user = await requireManage(id);
  const pct = Math.min(100, Math.max(0, Math.round(Number(progressPercent))));
  if (!Number.isFinite(pct)) return { ok: false, error: "Invalid progress value." };
  const before = await getProject(id);
  if (!before) return { ok: false, error: "Project not found." };
  await updateProject(id, { progressPercent: pct }, user.id);
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "progress_update",
    entity: "project",
    entityId: id,
    entityLabel: before.name,
    projectId: id,
    summary: `progress: ${before.progressPercent}% → ${pct}%`,
  });
  revalidate(id);
  return { ok: true, id };
}

export async function deleteProjectAction(id: string): Promise<ProjectActionResult> {
  const user = await requireManage(id);
  const before = await getProject(id);
  const result = await deleteProject(id, user.id);
  if (!result.ok) return { ok: false, error: "Could not delete project." };
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    entity: "project",
    entityId: id,
    entityLabel: before?.name ?? null,
    projectId: id,
  });
  await syncMessengerChannel(id);
  revalidate(id);
  return { ok: true };
}
