import type { Metadata } from "next";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { getPlatformSettings, getSignupMode } from "@/lib/platform/settings";
import { RESERVED_SLUGS } from "@/lib/platform/tenancy/slug";
import SignupModeForm from "./SignupModeForm";
import PlatformSettingsForm from "./PlatformSettingsForm";

export const metadata: Metadata = { title: "Platform settings" };

export default async function PlatformSettingsPage() {
  await requirePlatformPermission("settings.read");
  const [mode, s] = await Promise.all([getSignupMode(), getPlatformSettings()]);
  const initial = {
    platformName: s.platformName,
    supportEmail: s.supportEmail,
    supportUrl: s.supportUrl,
    defaultLocale: s.defaultLocale,
    defaultTimezone: s.defaultTimezone,
    maintenanceBanner: s.maintenanceBanner,
    reservedSubdomains: s.reservedSubdomains,
  };

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="Platform settings" description="Sign-up, platform identity, defaults for new companies, the maintenance banner and reserved addresses." crumbs={[{ label: "Administration" }]} />
      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Who can create a company</CardTitle>
          <CardDescription>Applies to the public sign-up page. Changing it never affects companies that already exist.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignupModeForm initial={mode} />
        </CardContent>
      </GlassCard>
      <PlatformSettingsForm
        key={s.updatedAt?.toISOString() ?? "defaults"}
        initial={initial}
        builtInReserved={[...RESERVED_SLUGS].sort()}
        timezones={Intl.supportedValuesOf("timeZone")}
      />
    </div>
  );
}
