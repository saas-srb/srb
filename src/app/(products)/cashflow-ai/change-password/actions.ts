"use server";

import { redirect } from "next/navigation";
import { getCurrentFmsUser, changeOwnFmsPassword } from "@/lib/fms-auth";

export interface ChangePasswordState {
  error?: string;
}

export async function changeFmsPasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentFmsUser();
  if (!user) redirect("/cashflow-ai/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnFmsPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };

  redirect("/cashflow-ai");
}
