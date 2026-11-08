"use server";

import { redirect } from "next/navigation";
import { getCurrentSeoUser, changeOwnSeoPassword } from "@/lib/seo-auth";

export interface ChangePasswordState {
  error?: string;
}

export async function changeSeoPasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentSeoUser();
  if (!user) redirect("/rankmax-ai/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnSeoPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };

  redirect("/rankmax-ai");
}
