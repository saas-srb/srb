"use server";

import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getCurrentHubUser, changeOwnHubPassword } from "@/lib/hub-auth";
import { revokeOtherSessions } from "@/lib/security/sessions";

export interface ChangePasswordState {
  error?: string;
}

export async function changeHubPasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnHubPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };
  // A changed password ends every other sign-in of the account, so a stolen session does not outlive it.
  await revokeOtherSessions(new ObjectId(user.id)).catch(() => 0);

  redirect("/commandos");
}
