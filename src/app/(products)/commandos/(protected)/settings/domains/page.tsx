import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { isSingleHost, listCompanyDomains, MAX_CUSTOM_DOMAINS } from "@/lib/platform/domains/custom";
import DomainsManager from "@/components/platform/DomainsManager";
import { addDomainAction, removeDomainAction, setPrimaryDomainAction, verifyDomainAction } from "./actions";

export const metadata: Metadata = { title: "Domains", robots: { index: false, follow: false } };

export default async function DomainsSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  await requireWorkspaceAccess("company.domains"); // Director-only item: anyone else sees the locked page inside this shell
  const domains = await listCompanyDomains();
  const companyId = await currentCompanyId();
  const [panelsUrl, one] = await Promise.all([appUrlForCompany(companyId), isSingleHost(companyId)]);

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Domains" }]}
          title={<>Domains</>}
          description={<>{one ? <>Put this workspace on your own domain or a subdomain of it (like app.yourcompany.com); a website you already have keeps working.</> : <>Put your website on your own domain and your app (this workspace) on <strong>app.&lt;your domain&gt;</strong>.</>} Right now your app is at <strong>{panelsUrl.replace(/^https?:\/\//, "")}</strong>. Follow the steps below; the SSL padlock is added automatically.</>}
        />
<div className="space-y-4">
        <GlassCard>
          <CardContent>
            <DomainsManager
              initial={domains}
              single={one}
              maxCustom={MAX_CUSTOM_DOMAINS}
              actions={{ add: addDomainAction, verify: verifyDomainAction, makePrimary: setPrimaryDomainAction, remove: removeDomainAction }}
            />
          </CardContent>
        </GlassCard>
      </div>
</div>
    </div>
  );
}
