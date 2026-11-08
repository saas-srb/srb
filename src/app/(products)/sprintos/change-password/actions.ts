"use server";

import { redirect } from "next/navigation";
import { getCurrentPmsUser, changeOwnPmsPassword } from "@/lib/pms-auth";
import { hasPmsStaffRole } from "@/lib/pms-roles";

export interface ChangePasswordState {
  error?: string;
}

export async function changePmsPasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentPmsUser();
  if (!user) redirect("/sprintos/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnPmsPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };

  redirect(hasPmsStaffRole(user.roles) ? "/sprintos" : "/sprintos/me");
}
