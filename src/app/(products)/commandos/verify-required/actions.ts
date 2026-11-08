"use server";

import { redirect } from "next/navigation";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getEmailLapse, unverifiedDirectors } from "@/lib/platform/email-lapse";
import { isEmailVerified, sendVerificationEmail } from "@/lib/platform/email-verification";
import { requestOrigin } from "@/lib/platform/request";

export type VerifyRequiredState = { status: "idle" } | { status: "sent"; email: string } | { status: "error"; error: string };

/** Emails a fresh link: to the signed-in person if their own address is the unverified one, otherwise to the first unverified Director. */
export async function sendLapseVerificationAction(): Promise<VerifyRequiredState> {
  const user = await getCurrentHubUser();
  if (!user) return { status: "error", error: "Your session has expired. Sign in again." };
  const { origin } = await requestOrigin();
  const targetId = isEmailVerified({ emailVerified: user.emailVerified }) ? (await unverifiedDirectors())[0]?.id : user.id;
  if (!targetId) return { status: "error", error: "There is nobody left to verify. Press “I've verified” to continue." };
  const res = await sendVerificationEmail(targetId, origin);
  return res.ok ? { status: "sent", email: res.email } : { status: "error", error: res.error };
}

/** "I've verified": back into the workspace once the hold is lifted, otherwise says so. */
export async function recheckLapseAction(): Promise<VerifyRequiredState> {
  if (!(await getEmailLapse()).lapsed) redirect("/commandos");
  return { status: "error", error: "Your email isn't verified yet. Open the link we emailed you, then check again." };
}
