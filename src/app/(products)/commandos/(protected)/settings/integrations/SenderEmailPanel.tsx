import { getOnboarding } from "@/lib/platform/onboarding/state";
import { suggestedSenderDomain, type SenderView } from "@/lib/platform/email/sender";
import EmailSenderManager from "../email/EmailSenderManager";
import { checkSenderAction, removeSenderAction, saveSenderAction } from "../email/actions";

/** Integrations → Sender email: send the workspace's emails from the company's own address (Director only). */
export default async function SenderEmailPanel({ sender }: { sender: SenderView | null }) {
  const { company } = await getOnboarding();
  // The included default address is shown under the company's own name; the platform's domain is never printed.
  const platformFrom = `${company.name} (included default address)`;
  const suggested = sender ? null : await suggestedSenderDomain();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        By default your emails (invitations, sign-in codes, invoices, notifications) go out from the included default address, <strong>{platformFrom}</strong>, and nothing needs setting up. If you would rather they come from your own address, like <strong>hello@yourbusiness.com</strong>, do these three steps.
      </p>
      <EmailSenderManager initial={sender} defaultName={company.name} suggested={suggested} platformFrom={platformFrom} actions={{ save: saveSenderAction, check: checkSenderAction, remove: removeSenderAction }} />
      <p className="text-sm text-muted-foreground">To go back to the included default address, press Remove above (or leave this empty).</p>
    </div>
  );
}
