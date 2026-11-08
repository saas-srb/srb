import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getOnboarding } from "@/lib/platform/onboarding/state";
import { getCompanySender, suggestedSenderDomain } from "@/lib/platform/email/sender";
import { defaultFrom } from "@/lib/platform/email";
import EmailSenderManager from "./EmailSenderManager";
import { checkSenderAction, removeSenderAction, saveSenderAction } from "./actions";

export const metadata: Metadata = { title: "Sender email", robots: { index: false, follow: false } };

export default async function EmailSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");
  const [sender, { company }, platformFrom] = await Promise.all([getCompanySender(), getOnboarding(), defaultFrom()]);
  const suggested = sender ? null : await suggestedSenderDomain();

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
        <PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Sender email" }]}
          title={<>Sender email</>}
          description={<>Send your emails (invitations, sign-in codes, invoices, automations) from your own address, like <strong>hello@yourbusiness.com</strong>, instead of ours. Connect a domain your business owns and publish the records shown below.</>}
        />
        <GlassCard>
          <CardContent>
            <EmailSenderManager
              initial={sender}
              defaultName={company.name}
              suggested={suggested}
              platformFrom={platformFrom}
              actions={{ save: saveSenderAction, check: checkSenderAction, remove: removeSenderAction }}
            />
          </CardContent>
        </GlassCard>
      </div>
    </div>
  );
}
