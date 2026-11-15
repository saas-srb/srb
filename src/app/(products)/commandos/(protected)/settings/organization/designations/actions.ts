"use server";

import { isDirector } from "@/lib/access/director";
import { revalidatePath } from "next/cache";
import { getCurrentHubUser } from "@/lib/hub-auth";
import {
  createDesignation,
  updateDesignation,
  deleteDesignation,
} from "@/lib/platform/organization";


async function requireSuperAdmin() {
  const user = await getCurrentHubUser();
  if (!user || !isDirector(user)) {
    throw new Error("Only a Director can manage organization settings.");
  }
  return user;
}

export async function createDesignationAction(data: {
  title: string;
  departmentId: string;
  level?: string | null;
}) {
  try {
    const user = await requireSuperAdmin();
    const title = data.title?.trim();
    const departmentId = data.departmentId?.trim();
    if (!title) {
      return { ok: false, error: "Designation title is required." };
    }
    if (!departmentId) {
      return { ok: false, error: "Department is required." };
    }
    const designation = await createDesignation(
      {
        title,
        departmentId,
        level: data.level?.trim() || null,
      },
      user.id
    );

    revalidatePath("/commandos/settings/organization/designations");
    revalidatePath("/commandos/users");
    return { ok: true, designation };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create designation.";
    return { ok: false, error: message };
  }
}

export async function updateDesignationAction(
  id: string,
  data: {
    title?: string;
    departmentId?: string;
    level?: string | null;
  }
) {
  try {
    const user = await requireSuperAdmin();
    const title = data.title?.trim();
    const departmentId = data.departmentId?.trim();
    if (title === "") {
      return { ok: false, error: "Designation title cannot be empty." };
    }
    if (departmentId === "") {
      return { ok: false, error: "Department cannot be empty." };
    }
    const designation = await updateDesignation(
      id,
      {
        ...(title !== undefined ? { title } : {}),
        ...(departmentId !== undefined ? { departmentId } : {}),
        ...(data.level !== undefined
          ? { level: data.level?.trim() || null }
          : {}),
      },
      user.id
    );
    if (!designation) {
      return { ok: false, error: "Designation not found." };
    }

    revalidatePath("/commandos/settings/organization/designations");
    revalidatePath("/commandos/users");
    return { ok: true, designation };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update designation.";
    return { ok: false, error: message };
  }
}

export async function deleteDesignationAction(id: string) {
  try {
    const user = await requireSuperAdmin();
    const res = await deleteDesignation(id, user.id);
    if (!res.ok) {
      return { ok: false, error: res.reason ?? "Could not delete designation." };
    }

    revalidatePath("/commandos/settings/organization/designations");
    revalidatePath("/commandos/users");
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete designation.";
    return { ok: false, error: message };
  }
}
