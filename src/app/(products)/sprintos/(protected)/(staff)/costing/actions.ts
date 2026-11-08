"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canViewCosting } from "@/lib/pms-roles";
import { getProject } from "@/lib/products/sprintos/projects";
import { updateCostingConfig } from "@/lib/products/sprintos/costing";
import { validateCostingConfig } from "@/lib/products/sprintos/validation";
import { recordActivity } from "@/lib/products/sprintos/activity";

export interface CostingActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function saveCostingConfigAction(
  projectId: string,
  input: Record<string, unknown>
): Promise<CostingActionResult> {
  const user = await getCurrentPmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canViewCosting(user)) throw new Error("Forbidden");

  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  const v = validateCostingConfig(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  await updateCostingConfig(projectId, v.data, user.id);
  await recordActivity({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "project",
    entityId: projectId,
    entityLabel: `Costing · ${project.name}`,
    projectId,
    summary: "Updated costing inputs",
  });
  revalidatePath(`/sprintos/costing/${projectId}`);
  revalidatePath("/sprintos/costing");
  return { ok: true };
}
