import { redirect } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { PanelName } from "@/components/platform/PanelsProvider";
import { BrandName } from "@/components/platform/BrandProvider";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { SKIP_HOURS, twoFactorPrompt, twoFactorStatus } from "@/lib/security/two-factor";
import { ObjectId } from "mongodb";
import { maskEmail } from "@/lib/security/email-otp";
import TwoStepSetupPanel from "./TwoStepSetupPanel";

export const dynamic = "force-dynamic";

/**
 * Shown at sign-in to anyone whose two-step sign-in is off (see `twoFactorPrompt`). Outside the protected area on purpose, so the person can
 * finish setting it up; every protected page sends them here until they turn it on or, where allowed, skip for a while.
 */
export default async function TwoFactorSetupPage() {
  const user = await getCurrentHubUser();
  if (!user || !ObjectId.isValid(user.id)) redirect("/commandos/login");
  const tf = await twoFactorStatus(new ObjectId(user.id));
  const prompt = await twoFactorPrompt(user); // "required" only where the operator made it mandatory: no Skip then
  const mode = prompt === "required" ? "required" : "due";

  return (
    <div className="lms-shell flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-12">
      <div className="flex items-center gap-2 text-lg font-bold">
        <BrandMark className="size-7 shrink-0" />
        <BrandName /> <span className="text-foreground"><PanelName panel="workspace" fallback="Workspace" /></span>
      </div>
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <TwoStepSetupPanel
          mode={mode}
          skipHours={SKIP_HOURS}
          continueHref="/commandos"
          director={user.roles.includes("super_admin")}
          initial={{ method: tf.method, enabledAt: tf.enabledAt ? tf.enabledAt.toISOString() : null, recoveryLeft: tf.recoveryLeft, available: tf.available, email: maskEmail(user.email) }}
        />
      </div>
    </div>
  );
}
