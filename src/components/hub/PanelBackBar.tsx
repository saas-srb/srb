import BillingNotice from "@/components/platform/BillingNotice";
import SetupBanner from "@/components/products/commandos/SetupBanner";
import { getEmailLapse } from "@/lib/platform/email-lapse";
import { getUpgradeOffer } from "@/lib/platform/billing/upgrade-offer";
import UpgradeBanner from "@/components/products/commandos/UpgradeBanner";
import VerifyEmailBanner from "@/components/products/commandos/VerifyEmailBanner";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { showVerifyStrip } from "@/lib/platform/email-verification-rule";
import { setupStripNeeded } from "@/lib/platform/onboarding/state";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { isStripDismissedServer } from "@/lib/platform/strip-dismiss-server";

/**
 * The top action row every product shares: Verify email, Choose plan (billing) and
 * Setup banners. The back link has been removed across all products.
 */
export default async function PanelBackBar() {
  let user = null;
  let verify = false;
  let daysLeft: number | undefined;
  let upgrade: Awaited<ReturnType<typeof getUpgradeOffer>> = null;
  let setup = { show: false, done: 0, total: 0 };
  let verifyDismissed = false;
  let setupDismissed = false;
  let upgradeDismissed = false;
  try {
    user = await getCurrentHubUser();
    if (user) {
      const [own, s, verifyIsDismissed, setupIsDismissed, upgradeIsDismissed] = await Promise.all([
        isPlatformOwnerContext().catch(() => false),
        setupStripNeeded(user.roles).catch(() => ({ show: false, done: 0, total: 0 })),
        isStripDismissedServer("verify-email"),
        isStripDismissedServer("setup"),
        isStripDismissedServer("upgrade"),
      ]);
      verify = showVerifyStrip({ emailVerified: user.emailVerified !== false, isPlatformOwnerCompany: own });
      setup = s;
      verifyDismissed = verifyIsDismissed;
      setupDismissed = setupIsDismissed;
      upgradeDismissed = upgradeIsDismissed;
      if (user.roles.includes("super_admin")) upgrade = await getUpgradeOffer();
      if (verify) daysLeft = (await getEmailLapse().catch(() => null))?.daysLeft;
    }
  } catch {
    user = null;
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 empty:hidden">
      {user && verify && <VerifyEmailBanner email={user.email} daysLeft={daysLeft} initiallyDismissed={verifyDismissed} />}
      <BillingNotice />
      {user && setup.show && <SetupBanner done={setup.done} total={setup.total} initiallyDismissed={setupDismissed} />}
      {user && upgrade && <UpgradeBanner offer={upgrade} initiallyDismissed={upgradeDismissed} />}
    </div>
  );
}
