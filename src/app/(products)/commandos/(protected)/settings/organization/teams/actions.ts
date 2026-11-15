"use server";

import { isDirector } from "@/lib/access/director";
import { revalidatePath } from "next/cache";
import { getCurrentHubUser } from "@/lib/hub-auth";
import {
  createTeam,
  updateTeam,
  deleteTeam,
} from "@/lib/platform/organization";

async function requireSuperAdmin() {
  const user = await getCurrentHubUser();
  if (!user || !isDirector(user)) {
    throw new Error("Only a Director can manage organization settings.");
  }
  return user;
}

export async function createTeamAction(data: {
  name: string;
  departmentId: string;
  leadEmployeeId?: string | null;
}) {
  try {
    const user = await requireSuperAdmin();
    const name = data.name?.trim();
    const departmentId = data.departmentId?.trim();
    if (!name) {
      return { ok: false, error: "Team name is required." };
    }
    if (!departmentId) {
      return { ok: false, error: "Department is required." };
    }
    const team = await createTeam(
      {
        name,
        departmentId,
        leadEmployeeId: data.leadEmployeeId?.trim() || null,
      },
      user.id
    );
    revalidatePath("/commandos/settings/organization/teams");
    return { ok: true, team };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create team.";
    return { ok: false, error: message };
  }
}

export async function updateTeamAction(
  id: string,
  data: {
    name?: string;
    departmentId?: string;
    leadEmployeeId?: string | null;
  }
) {
  try {
    const user = await requireSuperAdmin();
    const name = data.name?.trim();
    const departmentId = data.departmentId?.trim();
    if (name === "") {
      return { ok: false, error: "Team name cannot be empty." };
    }
    if (departmentId === "") {
      return { ok: false, error: "Department cannot be empty." };
    }
    const team = await updateTeam(
      id,
      {
        ...(name !== undefined ? { name } : {}),
        ...(departmentId !== undefined ? { departmentId } : {}),
        ...(data.leadEmployeeId !== undefined
          ? { leadEmployeeId: data.leadEmployeeId?.trim() || null }
          : {}),
      },
      user.id
    );
    if (!team) {
      return { ok: false, error: "Team not found." };
    }
    revalidatePath("/commandos/settings/organization/teams");
    return { ok: true, team };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update team.";
    return { ok: false, error: message };
  }
}

export async function deleteTeamAction(id: string) {
  try {
    const user = await requireSuperAdmin();
    const res = await deleteTeam(id, user.id);
    if (!res.ok) {
      return { ok: false, error: res.reason ?? "Could not delete team." };
    }
    revalidatePath("/commandos/settings/organization/teams");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete team.";
    return { ok: false, error: message };
  }
}
