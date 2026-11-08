import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchChannels } from "@/lib/products/commandos/teamchat";
import ChannelsFilterBar from "./ChannelsFilterBar";
import ChannelsGrid from "./ChannelsGrid";

export default async function AdminChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; kind?: string; archived?: string }>;
}) {
  await requireWorkspaceAccess("manage.teamchat.channels");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const archived = sp.archived === "true" ? true : sp.archived === "false" ? false : undefined;

  const { items, total, totalPages } = await searchChannels({
    page,
    pageSize: 20,
    search: sp.search,
    kind: sp.kind,
    archived,
  });

  const hasActiveFilters = Boolean(sp.search || sp.kind || sp.archived);

  const exportParams = new URLSearchParams();
  if (sp.search) exportParams.set("search", sp.search);
  if (sp.kind) exportParams.set("kind", sp.kind);
  if (sp.archived) exportParams.set("archived", sp.archived);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Team Chat", panel: "messenger" }, { label: "Channels" }]}
        title={<>Channels</>}
        description={<>{total} channel{total === 1 ? "" : "s"}.</>}
      />

      <ChannelsGrid
        rows={items}
        total={total}
        page={page}
        totalPages={totalPages}
        hasActiveFilters={hasActiveFilters}
        exportHref={`/api/commandos/teamchat/channels/export?${exportParams.toString()}`}
        filters={<ChannelsFilterBar initialSearch={sp.search ?? ""} initialKind={sp.kind ?? ""} initialArchived={sp.archived ?? ""} />}
      />
    </div>
  );
}
