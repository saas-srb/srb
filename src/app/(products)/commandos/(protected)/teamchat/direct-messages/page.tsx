import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchDirectConversations } from "@/lib/products/commandos/teamchat";
import DirectMessagesFilterBar from "./DirectMessagesFilterBar";
import DirectMessagesGrid from "./DirectMessagesGrid";

export default async function AdminDirectMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  await requireWorkspaceAccess("manage.teamchat.direct-messages");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);

  const { items, total, totalPages } = await searchDirectConversations({ page, pageSize: 20, search: sp.search });
  const hasActiveFilters = Boolean(sp.search);

  const exportParams = new URLSearchParams();
  if (sp.search) exportParams.set("search", sp.search);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Team Chat", panel: "messenger" }, { label: "Direct Messages" }]}
        title={<>Direct Message Conversations</>}
        description={<>{total} conversation{total === 1 ? "" : "s"}.</>}
      />

      <DirectMessagesGrid
        rows={items}
        total={total}
        page={page}
        totalPages={totalPages}
        hasActiveFilters={hasActiveFilters}
        exportHref={`/api/commandos/teamchat/direct-messages/export?${exportParams.toString()}`}
        filters={<DirectMessagesFilterBar initialSearch={sp.search ?? ""} />}
      />
    </div>
  );
}
