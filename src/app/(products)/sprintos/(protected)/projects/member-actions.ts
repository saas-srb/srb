"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canManageProjects } from "@/lib/pms-roles";
import { getProject } from "@/lib/products/sprintos/projects";
import { upsertMember, updateMember, removeMember, getMember } from "@/lib/products/sprintos/project-members";
import { validateMember } from "@/lib/products/sprintos/validation";
import { getMemberRoleLabel } from "@/lib/products/sprintos/constants";
import { recordActivity } from "@/lib/products/sprintos/activity";

export interface MemberActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireManage() {
  const user = await getCurrentPmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageProjects(user)) throw new Error("Forbidden");
  return user;
}

/** Best-effort: keep the Messenger project channel membership in sync. Never throws. */
async function syncMessengerChannel(projectId: string): Promise<void> {
  try {
    const { syncProjectChannel } = await import("@/lib/products/huddle-ai/projects");
    await syncProjectChannel(projectId);
  } catch {
    /* Messenger integration is optional */
  }
}

export async function saveMemberAction(
  projectId: string,
  input: Record<string, unknown>,
  memberId?: string
): Promise<MemberActionResult> {
  const user = await requireManage();
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  const v = validateMember(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (memberId) {
    const existing = await getMember(memberId);
    if (!existing || existing.projectId !== projectId) return { ok: false, error: "Member not found." };
    await updateMember(memberId, v.data, user.id);
    await recordActivity({
      actorId: user.id,
      actorEmail: user.email,
      action: "member_update",
      entity: "project_member",
      entityId: memberId,
      entityLabel: getMemberRoleLabel(v.data.role),
      projectId,
    });
  } else {
    const res = await upsertMember(projectId, v.data, user.id);
    if (!res.ok) return { ok: false, error: res.reason };
    await recordActivity({
      actorId: user.id,
      actorEmail: user.email,
      action: res.created ? "member_add" : "member_update",
      entity: "project_member",
      entityId: `${projectId}:${v.data.employeeId}`,
      entityLabel: getMemberRoleLabel(v.data.role),
      projectId,
    });
  }

  await syncMessengerChannel(projectId);
  revalidatePath(`/sprintos/projects/${projectId}`);
  revalidatePath("/sprintos");
  return { ok: true };
}

export async function removeMemberAction(projectId: string, memberId: string): Promise<MemberActionResult> {
  const user = await requireManage();
  const existing = await getMember(memberId);
  if (!existing || existing.projectId !== projectId) return { ok: false, error: "Member not found." };
  await removeMember(memberId, user.id);
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "member_remove",
    entity: "project_member",
    entityId: memberId,
    projectId,
  });
  await syncMessengerChannel(projectId);
  revalidatePath(`/sprintos/projects/${projectId}`);
  revalidatePath("/sprintos");
  return { ok: true };
}
