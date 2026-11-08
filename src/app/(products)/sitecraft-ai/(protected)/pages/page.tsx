import { redirect } from "next/navigation";
import { Files } from "lucide-react";
import { getViewer, can } from "@/lib/products/sitecraft-ai/viewer";
import { listPages } from "@/lib/products/sitecraft-ai/pages";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";
import { areaLabel, displayTitle } from "@/lib/products/sitecraft-ai/site-areas";
import NewPageDialog from "./NewPageDialog";
import PagesTable from "./PagesTable";

export default async function CmsPagesPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sitecraft-ai/login");

  const [pages, { area }] = await Promise.all([listPages(), searchParams]);
  const title = area ? areaLabel(area) : "Pages";

  return (
    <div className="space-y-4">
      <CmsPageHeader
        breadcrumbs={area ? [{ label: "Pages", href: "/sitecraft-ai/pages" }, { label: title }] : [{ label: "Pages" }]}
        icon={Files}
        title={title}
        description="Every page on the public website. Edit its sections and SEO, preview the draft, then publish."
        actions={can(viewer, "PAGES_CREATE") ? <NewPageDialog /> : undefined}
      />
      <PagesTable
        canPublish={can(viewer, "PAGES_PUBLISH")}
        rows={pages.map((p) => ({
          id: p._id,
          title: displayTitle(p.title, p.path),
          path: p.path,
          status: p.status,
          version: p.version,
          pending: p.hasUnpublishedChanges,
          updatedAt: new Date(p.updatedAt).toISOString(),
        }))}
      />
    </div>
  );
}
