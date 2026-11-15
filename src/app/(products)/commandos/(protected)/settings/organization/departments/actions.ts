"use server";

import { isDirector } from "@/lib/access/director";
import { revalidatePath } from "next/cache";
import { getCurrentHubUser } from "@/lib/hub-auth";
import {
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "@/lib/platform/organization";

async function requireSuperAdmin() {
  const user = await getCurrentHubUser();
  if (!user || !isDirector(user)) {
    throw new Error("Only a Director can manage organization settings.");
  }
  return user;
}

export async function createDepartmentAction(data: {
  name: string;
  code: string;
  description?: string | null;
}) {
  try {
    const user = await requireSuperAdmin();
    const name = data.name?.trim();
    const code = data.code?.trim().toUpperCase();
    if (!name || !code) {
      return { ok: false, error: "Name and code are required." };
    }
    const dept = await createDepartment(
      {
        name,
        code,
        description: data.description?.trim() || null,
      },
      user.id
    );
    revalidatePath("/commandos/settings/organization/departments");
    return { ok: true, department: dept };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create department.";
    return { ok: false, error: message };
  }
}

export async function updateDepartmentAction(
  id: string,
  data: {
    name?: string;
    code?: string;
    description?: string | null;
  }
) {
  try {
    const user = await requireSuperAdmin();
    const name = data.name?.trim();
    const code = data.code?.trim().toUpperCase();
    if (name === "" || code === "") {
      return { ok: false, error: "Name and code cannot be empty." };
    }
    const dept = await updateDepartment(
      id,
      {
        ...(name !== undefined ? { name } : {}),
        ...(code !== undefined ? { code } : {}),
        ...(data.description !== undefined
          ? { description: data.description?.trim() || null }
          : {}),
      },
      user.id
    );
    if (!dept) {
      return { ok: false, error: "Department not found." };
    }
    revalidatePath("/commandos/settings/organization/departments");
    return { ok: true, department: dept };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update department.";
    return { ok: false, error: message };
  }
}

export async function deleteDepartmentAction(id: string) {
  try {
    const user = await requireSuperAdmin();
    const res = await deleteDepartment(id, user.id);
    if (!res.ok) {
      return { ok: false, error: res.reason ?? "Could not delete department." };
    }
    revalidatePath("/commandos/settings/organization/departments");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete department.";
    return { ok: false, error: message };
  }
}
