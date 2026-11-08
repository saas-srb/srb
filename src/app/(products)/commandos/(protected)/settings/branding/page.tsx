import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getCompanyBrand, getStoredBranding } from "@/lib/platform/branding";
import BrandingThemeForm from "@/components/platform/BrandingThemeForm";
import { listThemeOptions } from "@/lib/platform/branding/theme-options";

export const metadata: Metadata = { title: "Branding", robots: { index: false, follow: false } };

export default async function BrandingSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
  const [stored, brand, { options: themes, activeKey, appliedKey }] = await Promise.all([getStoredBranding(), getCompanyBrand(), listThemeOptions()]);

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Branding" }]}
          title={<>Branding</>}
          description={<>Your logo, name and theme — applied to your website and every product.</>}
        />
<div className="space-y-4">
        <GlassCard>
          <CardContent>
            <BrandingThemeForm
              initial={{ ...stored, namePrimary: stored.namePrimary ?? brand.namePrimary, nameAccent: stored.nameAccent ?? brand.nameAccent }}
              companyName={brand.name}
              themes={themes}
              activeKey={activeKey}
              appliedKey={appliedKey}
              submitLabel="Save branding"
            />
          </CardContent>
        </GlassCard>
      </div>
</div>
    </div>
  );
}
