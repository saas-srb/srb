"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { changeProjectStatus, deleteProject, getProject } from "@/lib/products/sprintos/projects";
import { isValidProjectStatus, getProjectStatusMeta } from "@/lib/products/sprintos/constants";
import { recordActivity } from "@/lib/products/sprintos/activity";
import { listProjectMembers } from "@/lib/products/sprintos/project-members";
import { notifyEmployees } from "@/lib/products/sprintos/notifications";

/**
 * Mirrors `src/app/sprintos/(protected)/projects/actions.ts` (same guarded status
 * transitions via `changeProjectStatus`, same activity log + member
 * notifications) but gated on the admin session, not a PMS one. Full project
 * editing (dates, budget, technologies, …) stays on the existing, much richer
 * `/sprintos/projects/[id]` page rather than being rebuilt here — this listing
 * covers the quick actions a Director actually needs from an overview.
 */

async function notifyStatusChange(projectId: string, projectName: string, status: string, projectManagerId: string | null, actorId: string, actorEmail: string) {
  const members = await listProjectMembers(projectId);
  const recipients = Array.from(
    new Set([...members.map((m) => m.employeeId), projectManagerId].filter((x): x is string => Boolean(x)))
  );
  if (recipients.length === 0) return;
  await notifyEmployees(
    recipients,
    (uid) => ({
      recipientUserId: uid,
      type: "project_status_changed",
      title: `${projectName} is now ${getProjectStatusMeta(status).label}`,
      body: `Changed by ${actorEmail}`,
      link: `/sprintos/projects/${projectId}`,
      projectId,
    }),
    actorId
  );
}

export async function changeProjectStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.pms.projects");
  if (!isValidProjectStatus(status)) return { ok: false, error: "Unknown status." };

  const before = await getProject(id);
  const res = await changeProjectStatus(id, status, admin.id);
  if (!res.ok) return { ok: false, error: res.reason };

  await recordActivity({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "status_change",
    entity: "project",
    entityId: id,
    entityLabel: res.project.name,
    projectId: id,
    summary: `status: ${before?.status ?? "?"} → ${status}`,
  });
  await notifyStatusChange(id, res.project.name, status, res.project.projectManagerId, admin.id, admin.email);

  revalidatePath("/commandos/pms/projects");
  return { ok: true };
}

export async function deleteProjectAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.pms.projects");
  const before = await getProject(id);
  const result = await deleteProject(id, admin.id);
  if (!result.ok) return { ok: false, error: "Could not delete project." };

  await recordActivity({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "project",
    entityId: id,
    entityLabel: before?.name ?? null,
    projectId: id,
  });
  revalidatePath("/commandos/pms/projects");
  return { ok: true };
}

export async function bulkChangeProjectStatusAction(ids: string[], status: string): Promise<{ updated: number; failed: string[] }> {
  const admin = await requireWorkspaceAction("manage.pms.projects");
  if (!isValidProjectStatus(status)) return { updated: 0, failed: ids };

  let updated = 0;
  const failed: string[] = [];
  for (const id of ids) {
    const before = await getProject(id);
    const res = await changeProjectStatus(id, status, admin.id);
    if (res.ok) {
      updated += 1;
      await recordActivity({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "status_change",
        entity: "project",
        entityId: id,
        entityLabel: res.project.name,
        projectId: id,
        summary: `status: ${before?.status ?? "?"} → ${status}`,
      });
      await notifyStatusChange(id, res.project.name, status, res.project.projectManagerId, admin.id, admin.email);
    } else {
      failed.push(before?.name ?? id);
    }
  }
  revalidatePath("/commandos/pms/projects");
  return { updated, failed };
}

export async function bulkDeleteProjectsAction(ids: string[]): Promise<{ deleted: number }> {
  const admin = await requireWorkspaceAction("manage.pms.projects");
  let deleted = 0;
  for (const id of ids) {
    const before = await getProject(id);
    const result = await deleteProject(id, admin.id);
    if (result.ok) {
      deleted += 1;
      await recordActivity({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "delete",
        entity: "project",
        entityId: id,
        entityLabel: before?.name ?? null,
        projectId: id,
      });
    }
  }
  revalidatePath("/commandos/pms/projects");
  return { deleted };
}
