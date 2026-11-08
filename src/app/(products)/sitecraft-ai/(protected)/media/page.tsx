import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { redirect } from "next/navigation";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { listMedia } from "@/lib/products/sitecraft-ai/media";
import MediaLibraryGrid from "@/components/products/sitecraft-ai/MediaLibraryGrid";
import { Image as ImageIcon } from "lucide-react";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";

export default async function CmsMediaPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sitecraft-ai/login");

  const items = await listMedia();

  return (
    <div className="space-y-4">
      <CmsPageHeader
        breadcrumbs={[{ label: "Media Library" }]}
        icon={ImageIcon}
        title="Media Library"
        description={<>Every image used across the website. Click a file to edit its title and alt text, copy its URL or delete it.</>}
      />
      <PanelListFilters>
<MediaLibraryGrid initialItems={items} canUpload={can(viewer, "MEDIA_UPLOAD")} canDelete={can(viewer, "MEDIA_DELETE")} />
</PanelListFilters>
    </div>
  );
}
