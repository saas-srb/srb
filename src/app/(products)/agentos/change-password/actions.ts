"use server";

import { redirect } from "next/navigation";
import { getCurrentAibotsUser, changeOwnAibotsPassword } from "@/lib/aibots-auth";

export interface ChangePasswordState {
  error?: string;
}

export async function changeAibotsPasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentAibotsUser();
  if (!user) redirect("/agentos/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnAibotsPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };

  redirect("/agentos");
}
