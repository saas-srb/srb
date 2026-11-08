import type { Metadata } from "next";
import Link from "next/link";
import { Globe } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import CompanyAddresses from "@/components/hub/CompanyAddresses";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";

export const metadata: Metadata = { title: "Default domain", robots: { index: false, follow: false } };

/** One screen for both of the company's addresses: the public website and the app where the team signs in. */
export default async function AddressesPage() {
  await requireWorkspaceAccess("company.addresses");

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-6">
        <PanelPageHeader title={<>Default domain</>} description={<>Your company&apos;s two addresses: the public website and the app where your team signs in.</>} />
        <CompanyAddresses />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Globe className="size-4 text-primary" />Want your own domain, like yourcompany.com? Add it in{" "}
          <Link href="/commandos/settings/domains" className="font-semibold text-primary hover:underline">Settings → Domains</Link>.
        </p>
      </div>
    </div>
  );
}
