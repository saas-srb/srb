"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resetPasswordWithToken } from "@/lib/products/commandos/password-reset";
import { rateLimit } from "@/lib/security/rate-limit";

export interface ResetState { error?: string }

/** Sets the new password for a valid link, ends every sign-in of the account, and sends the person to sign in with it. */
export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const h = await headers();
  const limited = await rateLimit(new Request("http://internal", { headers: h }), "password-reset-use", 10, 900);
  if (!limited.ok) return { error: "Too many attempts. Please wait a few minutes and try again." };
  const token = String(formData.get("token") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!next) return { error: "Enter a new password." };
  if (next !== confirm) return { error: "The two passwords do not match." };
  const res = await resetPasswordWithToken(token, next);
  if (!res.ok) return { error: res.error };
  redirect("/commandos/login?reset=1");
}
