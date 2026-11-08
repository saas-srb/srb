import Link from "next/link";
import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Notice, SectionCard } from "@/components/products/agentos/AibotsUi";
import LiveCallsSetup from "@/components/products/agentos/calls/LiveCallsSetup";
import PhoneNav from "@/components/products/agentos/calls/PhoneNav";
import PhoneNumbers from "@/components/products/agentos/calls/PhoneNumbers";
import WebhookPanel from "@/components/products/agentos/calls/WebhookPanel";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { getConferenceSetup } from "@/lib/products/agentos/calls/conference-setup";
import { listPhoneNumbers, ownTwilio } from "@/lib/products/agentos/calls/numbers";
import { getWebhookSetup } from "@/lib/products/agentos/calls/webhook";
import { listAgentsForViewer } from "@/lib/products/agentos/picker";
import { workspaceAgentClient } from "@/lib/products/agentos/voice/connection";
import { can, getViewer } from "@/lib/products/agentos/viewer";

export const dynamic = "force-dynamic";

export default async function AgentosPhonePage() {
  await requireWorkspaceAccess("company.products");
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "VOICE_CALL_MANAGE")) redirect("/commandos");

  const [numbers, agents, twilio, eleven, webhook, liveSetup] = await Promise.all([
    listPhoneNumbers(viewer),
    listAgentsForViewer(viewer, { kind: "voice" }),
    ownTwilio().catch(() => null),
    workspaceAgentClient().catch(() => null),
    getWebhookSetup(viewer),
    getConferenceSetup(viewer),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Settings", href: "/commandos/settings" },
          { label: "Product settings", href: "/commandos/settings/products" },
          { label: "AgentOS", href: "/commandos/settings/products/agentos" },
          { label: "Phone" },
        ]}
        title="AgentOS Phone & calling"
        description="Manage phone numbers, live-call setup, call results and the calling rules used by AgentOS."
      />
      <PhoneNav />

      {!twilio && (
        <Notice tone="warn">
          Twilio isn&apos;t connected. Phone numbers come from your own Twilio account.{" "}
          <Link href="/commandos/settings/integrations" className="font-semibold underline">Connect Twilio in CommandOS → Integrations</Link>, then come back to add a number.
        </Notice>
      )}
      {!eleven && (
        <Notice tone="warn">
          ElevenLabs isn&apos;t connected, so numbers can&apos;t be added and agents can&apos;t call.{" "}
          <Link href="/commandos/settings/integrations" className="font-semibold underline">Add your ElevenLabs key in CommandOS → Integrations</Link>.
        </Notice>
      )}

      <SectionCard title="Phone numbers" description="Calls go out from these numbers. Choose which voice agent answers incoming calls on each.">
        <PhoneNumbers numbers={numbers} agents={agents} canImport={Boolean(twilio && eleven)} />
      </SectionCard>

      <SectionCard title="Live calls setup" description="What it takes to listen in on a phone call and take it over from the AI. Each step says what to do and where.">
        <LiveCallsSetup setup={liveSetup} />
      </SectionCard>

      <SectionCard title="Call results" description="ElevenLabs tells AgentOS when a call ends so the transcript, summary and collected answers are saved straight away.">
        <WebhookPanel setup={webhook} />
      </SectionCard>
    </div>
  );
}
