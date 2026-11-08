import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import FilesHub from "@/components/products/huddle-ai/FilesHub";
import { getCurrentChatUser } from "@/lib/messenger-auth";

export const dynamic = "force-dynamic";

export default async function SharedFilesPage() {
  const user = await getCurrentChatUser();
  if (!user) return null;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Messenger", href: "/huddle-ai" }, { label: "Shared Files" }]}
          title={<>Shared Files</>}
          description={<>Every file shared in a channel or DM you can see — searchable and filterable.</>}
        />
<PanelListFilters>
<div className="space-y-4">
        <FilesHub />
      </div>
</PanelListFilters>
</div>
    </div>
  );
}
