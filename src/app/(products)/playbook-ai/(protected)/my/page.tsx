import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import SopLibraryTable from "@/components/products/playbook-ai/SopLibraryTable";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { parseLibraryQuery, queryLibrary } from "@/lib/products/playbook-ai/library";
import { creatableDepartmentIds } from "@/lib/products/playbook-ai/access";
import { sopCan } from "@/lib/sop-roles";

export default async function MySopsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const query = parseLibraryQuery(await searchParams);
  const result = await queryLibrary(viewer, query, { scope: "mine" });

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SOP", href: "/playbook-ai" }, { label: "My SOPs" }]}
        title={<>My SOPs</>}
        description={<>SOPs you own, wrote or created — including your drafts. {result.total} total.</>}
      />
      <PanelListFilters>
<SopLibraryTable
        result={result}
        query={query}
        canCreate={creatableDepartmentIds(viewer)?.length !== 0}
        canExport={sopCan({ roles: viewer.roles, permissionOverrides: viewer.overrides }, "EXPORT")}
        exportBase="/api/playbook-ai/export/my"
        emptyLabel="You haven't created or been made owner of any SOPs yet."
      />
</PanelListFilters>
    </div>
  );
}
