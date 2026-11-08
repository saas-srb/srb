"use server";

import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { signOutThisDevice } from "@/lib/security/sessions";
import { sendVerificationEmail } from "@/lib/platform/email-verification";
import { requestOrigin } from "@/lib/platform/request";

/**
 * Centralized logout: destroys this account's session in EVERY product (not
 * just Hub's own), on every device. See `cross-module-sso.ts` for why this is
 * device-wide rather than scoped to the current login only.
 */
export async function hubLogoutAction(): Promise<void> {
  const user = await getCurrentHubUser();
  if (user && ObjectId.isValid(user.id)) {
    await signOutThisDevice(new ObjectId(user.id));
  }
  redirect("/commandos/login");
}

export type VerifyEmailSendState = { status: "idle" } | { status: "sent"; email: string } | { status: "error"; error: string };

/** The strip's "Verify email" button: emails the signed-in user a fresh link (rate limited), pointing at this company's own host. */
export async function sendVerificationEmailAction(): Promise<VerifyEmailSendState> {
  const user = await getCurrentHubUser();
  if (!user) return { status: "error", error: "Your session has expired. Sign in again." };
  const { origin } = await requestOrigin();
  const res = await sendVerificationEmail(user.id, origin);
  return res.ok ? { status: "sent", email: res.email } : { status: "error", error: res.error };
}
