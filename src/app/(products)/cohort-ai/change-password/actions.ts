"use server";

import { redirect } from "next/navigation";
import { getCurrentTmsUser, changeOwnTmsPassword } from "@/lib/tms-auth";
import { hasTmsStaffRole } from "@/lib/tms-roles";

export interface ChangePasswordState {
  error?: string;
}

export async function changeTmsPasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentTmsUser();
  if (!user) redirect("/cohort-ai/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnTmsPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };

  redirect(hasTmsStaffRole(user.roles) ? "/cohort-ai" : "/cohort-ai/me");
}
