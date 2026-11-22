import { requireLmsPage } from "@/lib/lms-auth";
import { lmsCan } from "@/lib/lms-auth";
import ChannelInbox from "@/components/products/dealflow-ai/ChannelInbox";
import { CHANNEL_SETTINGS_HREF, channelStatus, listChannelLeads } from "@/lib/dealflow-ai/channels";

export const dynamic = "force-dynamic";

export default async function PageLiveChat({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const user = await requireLmsPage("messages.view");
  const { lead } = await searchParams;
  const [leads, status] = await Promise.all([listChannelLeads(), { connected: true, via: "" }]);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <ChannelInbox mode="chat" leads={leads} status={status} settingsHref={CHANNEL_SETTINGS_HREF} canSend={lmsCan(user, "messages.send")} initialLeadId={lead} />
    </div>
  );
}
