import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";
import { isSingleHost, listCompanyDomains, MAX_CUSTOM_DOMAINS } from "@/lib/platform/domains/custom";
import DomainsManager from "@/components/platform/DomainsManager";
import { getOnboarding } from "@/lib/platform/onboarding/state";
import { getCompanySender, suggestedSenderDomain } from "@/lib/platform/email/sender";
import EmailSenderManager from "../email/EmailSenderManager";
import { checkSenderAction, removeSenderAction, saveSenderAction } from "../email/actions";
import { addDomainAction, removeDomainAction, setPrimaryDomainAction, verifyDomainAction } from "./actions";

export const metadata: Metadata = { title: "Domains", robots: { index: false, follow: false } };

export default async function DomainsSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  await requireWorkspaceAccess("company.domains"); // Director-only item: anyone else sees the locked page inside this shell
  const domains = await listCompanyDomains();
  const [sender, { company }] = await Promise.all([getCompanySender(), getOnboarding()]);
  // The included default address is shown under the company's own name; the platform's domain is never printed.
  const platformFrom = `${company.name} (included default address)`;
  const suggested = sender ? null : await suggestedSenderDomain();
  const companyId = await currentCompanyId();
  const [panelsUrl, one] = await Promise.all([appUrlForCompany(companyId), isSingleHost(companyId)]);

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Domains" }]}
          title={<>Domains</>}
          description={<>{one ? <>Put this workspace on your own domain.</> : <>Put your website on your own domain and your app (this workspace) on <strong>app.&lt;your domain&gt;</strong>.</>} Right now your app is at <strong>{panelsUrl.replace(/^https?:\/\//, "")}</strong>. Follow the steps below; the SSL padlock is added automatically.</>}
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
        <section id="sender-email" aria-labelledby="sender-email-title" className="scroll-mt-4">
          <GlassCard>
            <CardHeader>
              <CardTitle id="sender-email-title">Send emails from your own address</CardTitle>
              <CardDescription>
                By default your emails (invitations, sign-in codes, invoices, notifications) go out from the included default address, <strong>{platformFrom}</strong>, and nothing needs setting up. If you would rather they come from your own address, like <strong>hello@yourbusiness.com</strong>, do these three steps.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmailSenderManager
                initial={sender}
                defaultName={company.name}
                suggested={suggested}
                platformFrom={platformFrom}
                actions={{ save: saveSenderAction, check: checkSenderAction, remove: removeSenderAction }}
              />
              <p className="mt-4 text-sm text-muted-foreground">Prefer &quot;Use SRB&apos;s address instead&quot;? Press Remove above (or leave this empty): emails keep going out from SRB&apos;s address.</p>
            </CardContent>
          </GlassCard>
        </section>
      </div>
</div>
    </div>
  );
}
