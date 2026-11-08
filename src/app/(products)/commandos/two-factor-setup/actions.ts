"use server";

import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { snoozeTwoFactorSetup, twoFactorPrompt } from "@/lib/security/two-factor";
import { loginLanding } from "@/lib/platform/onboarding/state";

/**
 * "Skip for now": the person goes on to the workspace and the setup screen stays away for 72 hours (see SKIP_HOURS). Only where skipping is
 * allowed: not for anyone two-step is required of. Returns where to go instead of redirecting: the page then does a full navigation (a soft
 * redirect from here could keep re-fetching the same page in a loop, as the sign-in form once did).
 */
export async function skipTwoFactorSetupAction(): Promise<{ redirectTo: string }> {
  const user = await getCurrentHubUser();
  if (!user || !ObjectId.isValid(user.id)) redirect("/commandos/login");
  let skipped = false;
  if ((await twoFactorPrompt(user)) === "due") skipped = (await snoozeTwoFactorSetup(new ObjectId(user.id))).ok;
  // Where skipping is not allowed the setup screen simply stays; it never loops through the workspace.
  return { redirectTo: skipped ? await loginLanding(user.roles, null, user.id) : "/commandos/two-factor-setup" };
}
