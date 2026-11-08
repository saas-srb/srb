"use server";

import { redirect } from "next/navigation";
import { getCurrentChatUser, changeOwnChatPassword } from "@/lib/messenger-auth";

export interface ChangePasswordState {
  error?: string;
}

export async function changeMessengerPasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentChatUser();
  if (!user) redirect("/huddle-ai/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnChatPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };

  redirect("/huddle-ai");
}
