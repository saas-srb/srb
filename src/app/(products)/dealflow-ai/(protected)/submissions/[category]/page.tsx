import { requireLmsPage } from "@/lib/lms-auth";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import SubmissionsDataTable from "@/components/products/dealflow-ai/SubmissionsDataTable";
import ExportButton from "@/components/products/dealflow-ai/ExportButton";
import { searchLeads, isValidCategory, getCategoryLabel } from "@/lib/leads";
import { isValidLeadStatus } from "@/lib/lead-status";
import type { SerializedLead } from "@/components/products/dealflow-ai/types";

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function SubmissionsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  await requireLmsPage("VIEW_LEADS");
  const { category } = await params;
  if (!isValidCategory(category)) notFound();

  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidLeadStatus(sp.status) ? sp.status : undefined;
  const dateFrom = parseDateParam(sp.dateFrom);
  const dateTo = parseDateParam(sp.dateTo, true);
  const sortBy = sp.sortBy === "name" ? "name" : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchLeads(category, {
    page,
    pageSize: 20,
    search: sp.search,
    status,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
  });

  const serializedItems: SerializedLead[] = items.map((lead) => ({
    ...lead,
    _id: String(lead._id),
    createdAt: new Date(lead.createdAt).toISOString(),
    updatedAt: new Date(lead.updatedAt).toISOString(),
  }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: getCategoryLabel(category) }]}
        title={<>{getCategoryLabel(category)}</>}
        description={<>{total} submission{total === 1 ? "" : "s"}</>}
        actions={<><ExportButton
          params={{
            category,
            search: sp.search,
            status,
            dateFrom: sp.dateFrom,
            dateTo: sp.dateTo,
            sortBy,
            sortDir,
          }}
        /></>}
      />

      <SubmissionsDataTable
        category={category}
        items={serializedItems}
        total={total}
        page={page}
        totalPages={totalPages}
        initialSearch={sp.search ?? ""}
        initialStatus={status ?? ""}
        initialDateFrom={sp.dateFrom ?? ""}
        initialDateTo={sp.dateTo ?? ""}
        initialSortBy={sortBy}
        initialSortDir={sortDir}
      />
    </div>
  );
}
