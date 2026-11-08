import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Globe, PartyPopper } from "lucide-react";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import CompanyAddresses from "@/components/hub/CompanyAddresses";
import { Button } from "@/components/ui/button";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getCompanyBrand } from "@/lib/platform/branding";
import { ONBOARDING_PATH } from "@/lib/platform/onboarding/gate";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };

/** The first screen after registration: the company's two addresses, clearly, then on to setup. */
export default async function WelcomePage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
  const brand = await getCompanyBrand();

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-6">
        <PanelPageHeader
          leading={<span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><PartyPopper className="size-6" /></span>}
          title={<>Welcome, {brand.name} is ready</>}
          description={<>Your company has two addresses. Check them here and save them: one for your public website, one for you and your team to sign in.</>}
        />
        <CompanyAddresses />
        <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-bold text-foreground">Next: finish setting up your company</p>
            <p className="text-sm text-muted-foreground">Add your company details, departments, team and the products you use. It takes a few minutes.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href="/commandos" />} nativeButton={false} variant="outline" size="lg">Go to dashboard</Button>
            <Button render={<Link href={ONBOARDING_PATH} />} nativeButton={false} size="lg">Complete onboarding<ArrowRight className="size-4" /></Button>
          </div>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Globe className="size-4 text-primary" />Want your own domain, like yourcompany.com? Add it any time in{" "}
          <Link href="/commandos/settings/domains" className="font-semibold text-primary hover:underline">Settings → Domains</Link>.
        </p>
      </div>
    </div>
  );
}
