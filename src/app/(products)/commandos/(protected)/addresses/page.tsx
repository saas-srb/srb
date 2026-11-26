import type { Metadata } from "next";
import Link from "next/link";
import { Globe } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import CompanyAddresses, { hasOneAddress } from "@/components/hub/CompanyAddresses";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";

export const metadata: Metadata = { title: "Default domain", robots: { index: false, follow: false } };

/** One screen for both of the company's addresses: the public website and the app where the team signs in. */
export default async function AddressesPage() {
  await requireWorkspaceAccess("company.addresses");
  const one = await hasOneAddress();

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-6">
        <PanelPageHeader title={<>Default domain</>} description={one ? <>The address where you and your team sign in.</> : <>Your company&apos;s two addresses: the public website and the app where your team signs in.</>} />
        <CompanyAddresses />
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <Globe className="size-5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1"><strong>Use your own domain.</strong> {one ? "Add your own domain, like app.yourcompany.com, and your sign-in page, forms and emails use it instead." : "These default addresses end in the hosting service's name. Add your own domain, like yourcompany.com, and your website, your sign-in page and your emails all use it instead."}</p>
          <Link href="/commandos/settings/domains" className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90">Use your own domain</Link>
        </div>
      </div>
    </div>
  );
}
