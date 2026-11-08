import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchAllLeads } from "@/lib/products/commandos/crm-leads";
import { isValidCategory, type CategorySlug } from "@/lib/categories";
import { isValidLeadStatus } from "@/lib/lead-status";
import LeadsFilterBar from "./LeadsFilterBar";
import LeadsGrid from "./LeadsGrid";

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    category?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  await requireWorkspaceAccess("manage.crm.leads");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const category = sp.category && isValidCategory(sp.category) ? (sp.category as CategorySlug) : undefined;
  const status = sp.status && isValidLeadStatus(sp.status) ? sp.status : undefined;
  const dateFrom = parseDateParam(sp.dateFrom);
  const dateTo = parseDateParam(sp.dateTo, true);
  const sortBy = sp.sortBy === "name" || sp.sortBy === "dealValue" ? sp.sortBy : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchAllLeads({
    page,
    pageSize: 20,
    search: sp.search,
    category,
    status,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
  });

  const hasActiveFilters = Boolean(sp.search || sp.category || sp.status || sp.dateFrom || sp.dateTo);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "CRM", panel: "lms" }, { label: "Leads" }]}
        title={<>Leads</>}
        description={<>{total} lead{total === 1 ? "" : "s"}{" "}
          across every service category. A fresh, unqualified lead is what the spec calls an
          &quot;inquiry&quot; — filter by Status to see just those.</>}
      />

      <LeadsGrid
        rows={items}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={
          <LeadsFilterBar
            initialSearch={sp.search ?? ""}
            initialCategory={category ?? ""}
            initialStatus={status ?? ""}
            initialDateFrom={sp.dateFrom ?? ""}
            initialDateTo={sp.dateTo ?? ""}
          />
        }
      />
    </div>
  );
}
