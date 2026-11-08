"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { updateTask, deleteTask, getTask } from "@/lib/products/sprintos/tasks";
import { isValidTaskStatus } from "@/lib/products/sprintos/constants";

function revalidate() {
  revalidatePath("/commandos/pms/tasks");
}

export async function updateTaskStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.pms.tasks");
  if (!isValidTaskStatus(status)) return { ok: false, error: "Unknown status." };
  const updated = await updateTask(id, { status }, admin.id);
  revalidate();
  return { ok: updated !== null };
}

export async function deleteTaskAction(id: string): Promise<{ ok: boolean }> {
  const admin = await requireWorkspaceAction("manage.pms.tasks");
  const result = await deleteTask(id, admin.id);
  revalidate();
  return result;
}

export async function bulkUpdateTaskStatusAction(ids: string[], status: string): Promise<{ updated: number }> {
  const admin = await requireWorkspaceAction("manage.pms.tasks");
  if (!isValidTaskStatus(status)) return { updated: 0 };
  let updated = 0;
  for (const id of ids) {
    const before = await getTask(id);
    if (!before) continue;
    const result = await updateTask(id, { status }, admin.id);
    if (result) updated += 1;
  }
  revalidate();
  return { updated };
}

export async function bulkDeleteTasksAction(ids: string[]): Promise<{ deleted: number }> {
  const admin = await requireWorkspaceAction("manage.pms.tasks");
  let deleted = 0;
  for (const id of ids) {
    const result = await deleteTask(id, admin.id);
    if (result.ok) deleted += 1;
  }
  revalidate();
  return { deleted };
}
