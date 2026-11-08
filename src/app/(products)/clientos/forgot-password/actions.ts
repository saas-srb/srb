"use server";

import { redirect } from "next/navigation";
import { verifyForReset, resetPortalPassword } from "@/lib/products/clientos/registration";

export interface ForgotState {
  step: "identify" | "reset" | "done";
  error?: string;
  email?: string;
  phone?: string;
}

export async function portalForgotAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const intent = String(formData.get("intent") ?? "identify");
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (intent === "identify") {
    const res = await verifyForReset(email, phone);
    if (!res.ok) return { step: "identify", error: res.error, email, phone };
    return { step: "reset", email, phone };
  }

  // reset
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) return { step: "reset", error: "Passwords do not match.", email, phone };

  const verify = await verifyForReset(email, phone);
  if (!verify.ok) return { step: "identify", error: "Verification expired — start again.", email, phone };

  const done = await resetPortalPassword(verify.userId, password);
  if (!done.ok) return { step: "reset", error: done.error, email, phone };

  redirect("/login?reset=1");
}
