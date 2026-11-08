import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getCompanyBrand } from "@/lib/platform/branding";
import { getActiveThemeState } from "@/lib/products/sitecraft-ai/theme";
import { FALLBACK_THEME } from "@/lib/products/sitecraft-ai/theme-shared";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import AppSettingsForm from "@/components/pwa/AppSettingsForm";
import AppsTabs from "@/components/apps/AppsTabs";
import { buildCompanyIdentity } from "@/lib/pwa/identity";
import { qrSvg } from "@/lib/apps/qr";
import { brandInitials } from "@/lib/platform/branding/types";
import { getAppsOverview } from "@/lib/apps/overview";
import { availableAppPanels } from "@/lib/pwa/panels";
import { getAppSettings } from "@/lib/pwa/store";
import { saveAppSettingsAction, resetAppSettingsAction, uploadAppIconAction } from "../app/actions";
import { buildAppAction } from "./actions";

export const metadata: Metadata = { title: "Apps", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
  const companyId = await currentCompanyId();

  const [brand, theme, { settings }, panels, overview, identity] = await Promise.all([
    getCompanyBrand(),
    getActiveThemeState().catch(() => null),
    getAppSettings(),
    availableAppPanels(),
    getAppsOverview(companyId),
    buildCompanyIdentity(),
  ]);
  const tokens = theme?.tokens ?? FALLBACK_THEME;

  return (
    <div className="space-y-6">
      <PanelPageHeader
        breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Apps" }]}
        title={<>Apps</>}
        description={<>{brand.name}&apos;s own apps: a PWA for every device, native Android and iOS apps, and Windows, macOS and Linux desktop apps. Each one is generated only when you press its Generate button, with your name, logo and colours.</>}
      />
      <AppsTabs
        initial={overview}
        brand={{ name: identity.name, shortName: identity.shortName, description: identity.description, themeColor: identity.themeColor, backgroundColor: identity.backgroundColor, version: identity.version, logoUrl: brand.logoUrl, initials: brandInitials(brand.name) || "•", primary: tokens.colors.primary, primaryForeground: tokens.colors.primaryForeground }}
        qr={await qrSvg(`https://${overview.appAddress}`)}
        actions={{ build: buildAppAction }}
      />
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Appearance and behaviour</h2>
          <p className="text-sm text-muted-foreground">How every app looks and acts. Leave anything on Automatic to follow your branding and theme.</p>
        </div>
        <AppSettingsForm
          initial={settings}
          company={{ name: brand.name, logoUrl: brand.logoUrl, appUrl: overview.appAddress }}
          theme={{ primary: tokens.colors.primary, primaryForeground: tokens.colors.primaryForeground, background: tokens.colors.background, backgroundDark: tokens.colorsDark.background }}
          panels={panels.map((p) => ({ key: p.key, name: p.name, shortName: p.shortName }))}
          actions={{ save: saveAppSettingsAction, reset: resetAppSettingsAction, uploadIcon: uploadAppIconAction }}
        />
      </div>
    </div>
  );
}
