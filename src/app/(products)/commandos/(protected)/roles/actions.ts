"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { createCustomRole, deleteCustomRole, updateCustomRole } from "@/lib/products/commandos/custom-roles";
import type { CustomRoleInput } from "@/lib/products/commandos/custom-roles-shared";
import { writeBlockReason } from "@/lib/platform/billing/enforce";
import { workspaceEvents } from "@/lib/notify/triggers/workspace";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Defining who can do what is the Director's alone: a custom role is a way to hand out permissions. */
async function superAdminOnly() {
  const user = await requireWorkspaceAction("company.roles");
  if (!user.roles.includes("super_admin")) throw new Error("Forbidden");
  const readOnly = await writeBlockReason();
  if (readOnly) return { user, error: readOnly };
  return { user, error: null as string | null };
}

function done() {
  revalidatePath("/commandos/roles");
  revalidatePath("/commandos/users");
}

export async function createCustomRoleAction(input: CustomRoleInput): Promise<Result<{ id: string }>> {
  const { user, error } = await superAdminOnly();
  if (error) return { ok: false, error };
  const res = await createCustomRole(input, user.id);
  if (res.ok) done();
  return res;
}

export async function updateCustomRoleAction(id: string, input: CustomRoleInput): Promise<Result<{ affected: number }>> {
  const { user, error } = await superAdminOnly();
  if (error) return { ok: false, error };
  const res = await updateCustomRole(String(id), input, user.id);
  if (res.ok) {
    done();
    if (res.affected > 0) await workspaceEvents.customRoleChanged(String(input?.name ?? "A custom role"), res.affected, user.id);
  }
  return res;
}

export async function deleteCustomRoleAction(id: string): Promise<Result<{ affected: number }>> {
  const { user, error } = await superAdminOnly();
  if (error) return { ok: false, error };
  const res = await deleteCustomRole(String(id), user.id);
  if (res.ok) done();
  return res;
}
