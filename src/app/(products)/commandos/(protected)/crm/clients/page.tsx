import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchClients, listIndustries, serializeClient } from "@/lib/products/sprintos/clients";
import { isValidClientStatus } from "@/lib/products/sprintos/constants";
import ClientsFilterBar from "./ClientsFilterBar";
import ClientsGrid, { type AdminClientRow } from "./ClientsGrid";

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    industry?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  await requireWorkspaceAccess("manage.crm.clients");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidClientStatus(sp.status) ? sp.status : undefined;
  const sortBy = sp.sortBy === "companyName" ? "companyName" : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [{ items, total, totalPages }, industries] = await Promise.all([
    searchClients({ page, pageSize: 20, search: sp.search, status, industry: sp.industry, sortBy, sortDir }),
    listIndustries(),
  ]);

  const rows: AdminClientRow[] = items.map((c) => ({ ...serializeClient(c), projectCount: c.projectCount }));
  const hasActiveFilters = Boolean(sp.search || sp.status || sp.industry);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "CRM", panel: "lms" }, { label: "Clients" }]}
        title={<>Clients</>}
        description={<>{total} client{total === 1 ? "" : "s"}.</>}
      />

      <ClientsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={
          <ClientsFilterBar
            initialSearch={sp.search ?? ""}
            initialStatus={status ?? ""}
            initialIndustry={sp.industry ?? ""}
            industries={industries}
          />
        }
      />
    </div>
  );
}
