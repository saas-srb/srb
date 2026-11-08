import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import GlobalSearch from "@/components/products/huddle-ai/GlobalSearch";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Messenger", href: "/huddle-ai" }, { label: "Search" }]}
          title={<>Search</>}
        />
<div className="space-y-4">
        <GlobalSearch initialQuery={q ?? ""} />
      </div>
</div>
    </div>
  );
}
