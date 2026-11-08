"use server";

import { headers } from "next/headers";
import { requestPasswordReset } from "@/lib/products/commandos/password-reset";
import { rateLimit } from "@/lib/security/rate-limit";

export interface ForgotState { done?: boolean; error?: string }

/** Sends a reset link if the email has an account. The answer is the same either way, so it cannot be used to discover who has one. */
export async function forgotPasswordAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const h = await headers();
  const limited = await rateLimit(new Request("http://internal", { headers: h }), "password-reset", 5, 900);
  if (!limited.ok) return { error: "Too many requests. Please wait a few minutes and try again." };
  const email = String(formData.get("email") ?? "");
  if (!email.trim()) return { error: "Enter your email address." };
  await requestPasswordReset(email).catch((err) => console.error("[password-reset] could not send", err instanceof Error ? err.message : err));
  return { done: true };
}
