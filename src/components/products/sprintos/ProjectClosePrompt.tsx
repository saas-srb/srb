import { PhoneCall } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import CallWithAI from "@/components/products/agentos/calls/CallWithAI";

/**
 * Shown on a completed project. It only offers the calls: nothing is dialed until a person opens the dialog, picks an agent,
 * confirms the number and presses the button. Only the contact's name and the project name go to the agent.
 */
export default function ProjectClosePrompt({
  projectId, projectName, contactName, contactPhone, context, doNotContact,
}: {
  projectId: string;
  projectName: string;
  contactName: string | null;
  contactPhone: string | null;
  context: Record<string, string>;
  doNotContact: boolean;
}) {
  const target = { product: "sprintos", entityType: "project", entityId: projectId, label: projectName };
  const blocked = doNotContact ? "This client asked not to be contacted, so AI calls are switched off." : !contactPhone ? "Add a phone number to the client's primary contact to enable calls." : null;
  return (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle className="flex items-center gap-2"><PhoneCall className="size-4" /> Project closed</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Project closed: schedule a development update call or an upsell call{contactName ? ` with ${contactName}` : ""}. Nothing is called automatically.
        </p>
        {blocked ? (
          <p className="text-xs text-muted-foreground">{blocked}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <CallWithAI target={target} phone={contactPhone ?? undefined} context={context} defaultPurpose="project_update" variant="default" size="sm" label="Development update call" />
            <CallWithAI target={target} phone={contactPhone ?? undefined} context={context} defaultPurpose="upsell" variant="outline" size="sm" label="Upsell call" />
          </div>
        )}
      </CardContent>
    </GlassCard>
  );
}
