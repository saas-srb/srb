"use server";

import { redirect } from "next/navigation";
import { getCurrentCmsUser, changeOwnCmsPassword } from "@/lib/cms-auth";

export interface ChangePasswordState {
  error?: string;
}

export async function changeCmsPasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentCmsUser();
  if (!user) redirect("/sitecraft-ai/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnCmsPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };

  redirect("/sitecraft-ai");
}
