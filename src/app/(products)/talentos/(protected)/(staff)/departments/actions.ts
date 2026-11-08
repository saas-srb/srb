"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManageMasters } from "@/lib/hrms-roles";
import {
  createDepartment,
  updateDepartment,
  deleteDepartment,
  createDesignation,
  updateDesignation,
  deleteDesignation,
  createTeam,
  updateTeam,
  deleteTeam,
} from "@/lib/products/talentos/departments";
import { validateDepartment, validateDesignation, validateTeam } from "@/lib/products/talentos/validation";
import { recordAudit } from "@/lib/products/talentos/audit";

export interface MasterActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireMasters() {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageMasters(user)) throw new Error("Forbidden");
  return user;
}

function revalidate() {
  revalidatePath("/talentos/departments");
  revalidatePath("/talentos/employees");
  revalidatePath("/talentos");
}

// ---- Departments ----------------------------------------------------------

export async function saveDepartmentAction(input: Record<string, unknown>, id?: string): Promise<MasterActionResult> {
  const user = await requireMasters();
  const v = validateDepartment(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (id) {
    const updated = await updateDepartment(id, v.data, user.id);
    if (!updated) return { ok: false, error: "Department not found." };
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "department", entityId: id, entityLabel: v.data.name });
  } else {
    const created = await createDepartment(v.data, user.id);
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "department", entityId: created._id, entityLabel: v.data.name });
  }
  revalidate();
  return { ok: true };
}

export async function deleteDepartmentAction(id: string): Promise<MasterActionResult> {
  const user = await requireMasters();
  const result = await deleteDepartment(id, user.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete department." };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "department", entityId: id });
  revalidate();
  return { ok: true };
}

// ---- Designations --------------------------------------------------------

export async function saveDesignationAction(input: Record<string, unknown>, id?: string): Promise<MasterActionResult> {
  const user = await requireMasters();
  const v = validateDesignation(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (id) {
    const updated = await updateDesignation(id, v.data, user.id);
    if (!updated) return { ok: false, error: "Designation not found." };
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "designation", entityId: id, entityLabel: v.data.title });
  } else {
    const created = await createDesignation(v.data, user.id);
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "designation", entityId: created._id, entityLabel: v.data.title });
  }
  revalidate();
  return { ok: true };
}

export async function deleteDesignationAction(id: string): Promise<MasterActionResult> {
  const user = await requireMasters();
  const result = await deleteDesignation(id, user.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete designation." };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "designation", entityId: id });
  revalidate();
  return { ok: true };
}

// ---- Teams --------------------------------------------------------------

export async function saveTeamAction(input: Record<string, unknown>, id?: string): Promise<MasterActionResult> {
  const user = await requireMasters();
  const v = validateTeam(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (id) {
    const updated = await updateTeam(id, v.data, user.id);
    if (!updated) return { ok: false, error: "Team not found." };
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "team", entityId: id, entityLabel: v.data.name });
  } else {
    const created = await createTeam(v.data, user.id);
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "team", entityId: created._id, entityLabel: v.data.name });
  }
  revalidate();
  return { ok: true };
}

export async function deleteTeamAction(id: string): Promise<MasterActionResult> {
  const user = await requireMasters();
  const result = await deleteTeam(id, user.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete team." };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "team", entityId: id });
  revalidate();
  return { ok: true };
}
