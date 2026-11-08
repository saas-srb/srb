"use server";

import { redirect } from "next/navigation";
import { getCurrentDlmsUser, changeOwnDlmsPassword } from "@/lib/dlms-auth";

export interface ChangePasswordState {
  error?: string;
}

export async function changeDlmsPasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getCurrentDlmsUser();
  if (!user) redirect("/cybervault/login");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next) return { error: "Fill in every field." };
  if (next !== confirm) return { error: "New passwords do not match." };

  const result = await changeOwnDlmsPassword(user.id, current, next);
  if (!result.ok) return { error: result.error };

  redirect("/cybervault");
}
