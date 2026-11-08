import { requireLmsPage } from "@/lib/lms-auth";
import { lmsCan } from "@/lib/lms-roles";
import ChannelInbox from "@/components/products/dealflow-ai/ChannelInbox";
import { CHANNEL_SETTINGS_HREF, channelStatus, listChannelLeads } from "@/lib/dealflow-ai/channels";

export const dynamic = "force-dynamic";

export default async function PageWhatsApp({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const user = await requireLmsPage("VIEW_LEADS");
  const { lead } = await searchParams;
  const [leads, status] = await Promise.all([listChannelLeads(), channelStatus("whatsapp")]);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <ChannelInbox mode="whatsapp" leads={leads} status={status} settingsHref={CHANNEL_SETTINGS_HREF} canSend={lmsCan(user, "MESSAGE_LEADS")} initialLeadId={lead} />
    </div>
  );
}
