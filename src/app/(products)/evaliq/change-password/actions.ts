"use server";

import { redirect } from "next/navigation";
import { getCurrentOtsUser, changeOwnOtsPassword } from "@/lib/ots-auth";

export interface ChangePasswordState {
  error?: string;
}

export async function changeOtsPasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentOtsUser();
  if (!user) redirect("/evaliq/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnOtsPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };

  redirect("/evaliq");
}
