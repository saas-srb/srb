import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { redirect } from "next/navigation";
import { SearchCheck } from "lucide-react";
import { getViewer } from "@/lib/products/sitecraft-ai/viewer";
import { listPages } from "@/lib/products/sitecraft-ai/pages";
import CmsPageHeader from "@/components/products/sitecraft-ai/ui/CmsPageHeader";
import SeoTable from "./SeoTable";

export default async function CmsSeoOverviewPage() {
  if (!(await getViewer())) redirect("/sitecraft-ai/login");
  const pages = await listPages();

  return (
    <div className="space-y-4">
      <CmsPageHeader
        breadcrumbs={[{ label: "SEO Overview" }]}
        icon={SearchCheck}
        title="SEO Overview"
        description={<>Every page&apos;s live search appearance at a glance, with length checks. Click a page to edit its SEO; overrides in the SEO product still take priority.</>}
      />
      <PanelListFilters>
<SeoTable
        rows={pages
          .filter((p) => p.status !== "archived")
          .map((p) => {
            const seo = p.live?.seo ?? p.draft.seo ?? null;
            return {
              id: p._id,
              path: p.path,
              pageTitle: p.title,
              title: seo?.title ?? "",
              description: seo?.description ?? "",
              canonical: seo?.canonical ?? null,
              noindex: seo?.robots?.index === false,
              hasImage: Boolean(seo?.image),
              jsonLd: (p.live?.jsonLd ?? p.draft.jsonLd ?? []).length,
              pending: p.hasUnpublishedChanges,
            };
          })
          .sort((a, b) => a.path.localeCompare(b.path))}
      />
</PanelListFilters>
    </div>
  );
}
