"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageProjects } from "@/lib/pms-roles";
import { getProject } from "@/lib/products/sprintos/projects";
import { createMilestone, updateMilestone, deleteMilestone, getMilestone } from "@/lib/products/sprintos/milestones";
import { validateMilestone } from "@/lib/products/sprintos/validation";
import { recordActivity, diffSummary } from "@/lib/products/sprintos/activity";
import { notifyEmployees } from "@/lib/products/sprintos/notifications";

export interface MilestoneActionResult {
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

function revalidate(projectId: string) {
  revalidatePath(`/sprintos/projects/${projectId}`);
  revalidatePath(`/sprintos/projects/${projectId}/milestones`);
  revalidatePath("/sprintos");
}

export async function saveMilestoneAction(
  projectId: string,
  input: Record<string, unknown>,
  milestoneId?: string
): Promise<MilestoneActionResult> {
  const user = await requireManage();
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  const v = validateMilestone(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (milestoneId) {
    const before = await getMilestone(milestoneId);
    if (!before || before.projectId !== projectId) return { ok: false, error: "Milestone not found." };
    const updated = await updateMilestone(milestoneId, v.data, user.id);
    await recordActivity({
      actorId: user.id,
      actorEmail: user.email,
      action: "update",
      entity: "milestone",
      entityId: milestoneId,
      entityLabel: v.data.name,
      projectId,
      summary: diffSummary(
        { name: before.name, status: before.status, due: before.dueDate, links: before.linkedTaskIds.length },
        { name: v.data.name, status: v.data.status, due: v.data.dueDate, links: v.data.linkedTaskIds.length },
        ["name", "status", "due", "links"]
      ),
    });
    if (v.data.status === "completed" && before.status !== "completed" && project.projectManagerId) {
      await notifyEmployees([project.projectManagerId], (uid) => ({
        recipientUserId: uid,
        type: "milestone_completed",
        title: `Milestone completed: ${v.data.name}`,
        body: project.name,
        link: `/sprintos/projects/${projectId}`,
        projectId,
      }), user.id);
    }
    revalidate(projectId);
    return { ok: true, id: updated?._id };
  }

  const created = await createMilestone(projectId, v.data, user.id);
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "milestone",
    entityId: created._id,
    entityLabel: v.data.name,
    projectId,
  });
  revalidate(projectId);
  return { ok: true, id: created._id };
}

export async function deleteMilestoneAction(projectId: string, milestoneId: string): Promise<MilestoneActionResult> {
  const user = await requireManage();
  const before = await getMilestone(milestoneId);
  if (!before || before.projectId !== projectId) return { ok: false, error: "Milestone not found." };
  await deleteMilestone(milestoneId, user.id);
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    entity: "milestone",
    entityId: milestoneId,
    entityLabel: before.name,
    projectId,
  });
  revalidate(projectId);
  return { ok: true };
}
