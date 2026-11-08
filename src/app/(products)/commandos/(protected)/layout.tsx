import { redirect } from "next/navigation";
import WorkspaceShell from "@/components/hub/WorkspaceShell";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
import { getWorkspaceNav } from "@/lib/products/commandos/access";
import { emailLapseGate } from "@/lib/platform/email-lapse";
import { afterForCompany } from "@/lib/platform/tenancy/context";
import { dispatchDueThrottled } from "@/lib/notify/center/announcements";
import { mustSetUpTwoFactor } from "@/lib/security/two-factor";

export const generateMetadata = () => brandedMetadata("{brand} {product:workspace}", { robots: { index: false, follow: false } });

export default async function ProtectedHubLayout({ children }: { children: React.ReactNode }) {
  const session = await getWorkspaceNav();
  if (!session) redirect("/commandos/login");
  if (session.user.mustChangePassword) redirect("/commandos/change-password");
  await emailLapseGate(); // unverified past 30 days: on hold, with a way to verify
  // Two-step sign-in off: the setup screen comes first at sign-in ("Skip for now" silences it for 72 hours; where it is required there is no skip).
  if (await mustSetUpTwoFactor(session.user)) redirect("/commandos/two-factor-setup");

  // Scheduled announcements that have come due go out as soon as anyone opens the workspace (the cron covers quiet hours).
  await afterForCompany(dispatchDueThrottled).catch(() => {});

  return (
    <WorkspaceShell user={session.user} nav={session.nav}>
      {children}
    </WorkspaceShell>
  );
}
