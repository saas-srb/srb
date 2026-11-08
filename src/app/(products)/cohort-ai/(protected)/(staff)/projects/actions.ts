"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageTraining } from "@/lib/tms-roles";
import {
  createLiveProject,
  updateLiveProject,
  deleteLiveProject,
  getLiveProject,
  toggleMilestone,
} from "@/lib/products/cohort-ai/projects";
import { getProgram } from "@/lib/products/cohort-ai/programs";
import { validateLiveProject } from "@/lib/products/cohort-ai/validation";
import { recordAudit, diffSummary } from "@/lib/products/cohort-ai/audit";

export interface ProjectActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireManage() {
  const user = await getCurrentTmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTraining(user)) throw new Error("Forbidden");
  return user;
}

function revalidate(id?: string) {
  revalidatePath("/cohort-ai/projects");
  revalidatePath("/cohort-ai/me/projects");
  revalidatePath("/cohort-ai");
  if (id) revalidatePath(`/cohort-ai/projects/${id}`);
}

export async function saveLiveProjectAction(
  input: Record<string, unknown>,
  id?: string
): Promise<ProjectActionResult> {
  const user = await requireManage();
  const v = validateLiveProject(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const program = await getProgram(v.data.programId);
  if (!program) return { ok: false, fieldErrors: { programId: "That program no longer exists." } };

  if (id) {
    const before = await getLiveProject(id);
    if (!before) return { ok: false, error: "Project not found." };
    const updated = await updateLiveProject(id, v.data, user.id);
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "update",
      entity: "project",
      entityId: id,
      entityLabel: v.data.title,
      summary: diffSummary(
        { title: before.title, status: before.status, students: before.studentIds.length },
        { title: v.data.title, status: v.data.status, students: v.data.studentIds.length },
        ["title", "status", "students"]
      ),
    });
    revalidate(id);
    return { ok: true, id: updated?._id };
  }

  const created = await createLiveProject(v.data, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "project",
    entityId: created._id,
    entityLabel: v.data.title,
  });
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function deleteLiveProjectAction(id: string): Promise<ProjectActionResult> {
  const user = await requireManage();
  const before = await getLiveProject(id);
  const ok = await deleteLiveProject(id, user.id);
  if (!ok) return { ok: false, error: "Could not delete project." };
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    entity: "project",
    entityId: id,
    entityLabel: before?.title ?? null,
  });
  revalidate(id);
  return { ok: true };
}

/** Toggle a milestone. Staff always; an assigned student may toggle on their own project. */
export async function toggleMilestoneAction(
  projectId: string,
  milestoneId: string,
  done: boolean
): Promise<ProjectActionResult> {
  const user = await getCurrentTmsUser();
  if (!user) throw new Error("Unauthorized");
  const project = await getLiveProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  const isStaff = canManageTraining(user);
  const isAssignedStudent = Boolean(user.studentId && project.studentIds.includes(user.studentId));
  if (!isStaff && !isAssignedStudent) throw new Error("Forbidden");

  await toggleMilestone(projectId, milestoneId, done, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "project",
    entityId: projectId,
    entityLabel: project.title,
    summary: `milestone ${done ? "completed" : "reopened"}`,
  });
  revalidate(projectId);
  return { ok: true, id: projectId };
}
