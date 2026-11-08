"use server";

import { redirect } from "next/navigation";
import { getCurrentHrmsUser, changeOwnPassword } from "@/lib/hrms-auth";
import { hasStaffRole } from "@/lib/hrms-roles";

export interface ChangePasswordState {
  error?: string;
}

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentHrmsUser();
  if (!user) redirect("/talentos/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };

  redirect(hasStaffRole(user.roles) ? "/talentos" : "/talentos/me");
}
