"use server";

import { redirect } from "next/navigation";
import { getCurrentSopUser, changeOwnSopPassword } from "@/lib/sop-auth";

export interface ChangePasswordState {
  error?: string;
}

export async function changeSopPasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentSopUser();
  if (!user) redirect("/playbook-ai/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnSopPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };

  redirect("/playbook-ai");
}
