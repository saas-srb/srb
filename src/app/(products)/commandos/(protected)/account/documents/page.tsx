import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchDocuments, DOCUMENT_MODULES, type DocumentModule } from "@/lib/products/commandos/documents";
import DocumentsFilterBar from "./DocumentsFilterBar";
import DocumentsGrid from "./DocumentsGrid";

export default async function AdminDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; module?: string }>;
}) {
  await requireWorkspaceAccess("account.documents");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const moduleFilter = (DOCUMENT_MODULES as readonly string[]).includes(sp.module ?? "")
    ? (sp.module as DocumentModule)
    : undefined;

  const { items, total, totalPages } = await searchDocuments({
    page,
    pageSize: 20,
    search: sp.search,
    module: moduleFilter,
  });

  const hasActiveFilters = Boolean(sp.search || moduleFilter);

  const exportParams = new URLSearchParams();
  if (sp.search) exportParams.set("search", sp.search);
  if (moduleFilter) exportParams.set("module", moduleFilter);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Account" }, { label: "Documents" }]}
        title={<>Documents</>}
        description={<>{total} document{total === 1 ? "" : "s"} across Project Management, TalentOS, and the External Portal.</>}
      />

      <DocumentsGrid
        rows={items}
        total={total}
        page={page}
        totalPages={totalPages}
        hasActiveFilters={hasActiveFilters}
        exportHref={`/api/commandos/documents/export?${exportParams.toString()}`}
        filters={<DocumentsFilterBar initialSearch={sp.search ?? ""} initialModule={moduleFilter ?? ""} />}
      />
    </div>
  );
}
