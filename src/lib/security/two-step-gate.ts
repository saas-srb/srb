import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { mustSetUpTwoFactor } from "@/lib/security/two-factor";
import { emailLapseGate } from "@/lib/platform/email-lapse";
import { trialLockGate } from "@/lib/platform/billing/trial-lock";

/**
 * Every product's signed-in area starts with this. A company on hold for an unverified email is sent to the page that explains it;
 * someone whose two-step sign-in is off is sent to the setup screen first, in whichever product they open (see `twoFactorPrompt` for who, how often and who cannot skip). Once per request, so layouts below it add no cost.
 */
export const twoStepGate = cache(async (): Promise<void> => {
  const user = await getCurrentHubUser();
  if (!user) return; // not signed in with the company sign-in: the product's own checks decide
  await emailLapseGate(); // the 30 days for verifying the company email ran out: the workspace is on hold
  await trialLockGate(); // the free trial ended and no plan was bought: the workspace is locked until one is
  if (await mustSetUpTwoFactor(user)) redirect("/commandos/two-factor-setup");
});
