"use server";

import { redirect } from "next/navigation";
import { getCurrentPrmsUser, changeOwnPrmsPassword } from "@/lib/prms-auth";
import { hasPrmsStaffRole } from "@/lib/prms-roles";

export interface ChangePasswordState {
  error?: string;
}

export async function changePrmsPasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentPrmsUser();
  if (!user) redirect("/spendiq/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnPrmsPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };

  redirect(hasPrmsStaffRole(user.roles) ? "/spendiq" : "/spendiq/me");
}
