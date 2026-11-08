import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { redirect } from "next/navigation";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { listNavItems } from "@/lib/products/sitecraft-ai/nav";
import NavigationManager from "@/components/products/sitecraft-ai/NavigationManager";
import { Menu } from "lucide-react";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";

export default async function CmsNavigationPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sitecraft-ai/login");

  const items = await listNavItems();

  return (
    <div className="space-y-4">
      <CmsPageHeader
        breadcrumbs={[{ label: "Header & Navigation" }]}
        icon={Menu}
        title="Header & Navigation"
        description={<>The website&apos;s header menu — its columns, links, icons and featured cards. The desktop mega-menu and the mobile menu share it; changes go live immediately.</>}
      />
      <PanelListFilters>
<NavigationManager initialItems={items} canEdit={can(viewer, "NAV_MANAGE")} />
</PanelListFilters>
    </div>
  );
}
