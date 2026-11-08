"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { updateMilestone, deleteMilestone } from "@/lib/products/sprintos/milestones";
import { isValidMilestoneStatus } from "@/lib/products/sprintos/constants";

function revalidate() {
  revalidatePath("/commandos/pms/milestones");
}

export async function updateMilestoneStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.pms.milestones");
  if (!isValidMilestoneStatus(status)) return { ok: false, error: "Unknown status." };
  const updated = await updateMilestone(id, { status }, admin.id);
  revalidate();
  return { ok: updated !== null };
}

export async function deleteMilestoneAction(id: string): Promise<{ ok: boolean }> {
  const admin = await requireWorkspaceAction("manage.pms.milestones");
  const result = await deleteMilestone(id, admin.id);
  revalidate();
  return result;
}

export async function bulkUpdateMilestoneStatusAction(ids: string[], status: string): Promise<{ updated: number }> {
  const admin = await requireWorkspaceAction("manage.pms.milestones");
  if (!isValidMilestoneStatus(status)) return { updated: 0 };
  let updated = 0;
  for (const id of ids) {
    const result = await updateMilestone(id, { status }, admin.id);
    if (result) updated += 1;
  }
  revalidate();
  return { updated };
}

export async function bulkDeleteMilestonesAction(ids: string[]): Promise<{ deleted: number }> {
  const admin = await requireWorkspaceAction("manage.pms.milestones");
  let deleted = 0;
  for (const id of ids) {
    const result = await deleteMilestone(id, admin.id);
    if (result.ok) deleted += 1;
  }
  revalidate();
  return { deleted };
}
