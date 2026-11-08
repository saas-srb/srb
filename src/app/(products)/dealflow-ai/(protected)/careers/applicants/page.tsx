import { requireLmsPage } from "@/lib/lms-auth";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import CareerApplicationsDataTable from "@/components/products/dealflow-ai/CareerApplicationsDataTable";
import CareersExportButton from "@/components/products/dealflow-ai/CareersExportButton";
import RestoreAccountsButton from "./RestoreAccountsButton";
import { searchApplications, getAllJobPositions } from "@/lib/career-applications";
import { isValidCareerApplicationStatus } from "@/lib/career-application-status";
import type { SerializedCareerApplication } from "@/components/products/dealflow-ai/types";

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function ApplicantsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    position?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  await requireLmsPage("VIEW_CAREERS");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidCareerApplicationStatus(sp.status) ? sp.status : undefined;
  const dateFrom = parseDateParam(sp.dateFrom);
  const dateTo = parseDateParam(sp.dateTo, true);
  const sortBy = sp.sortBy === "name" ? "name" : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [{ items, total, totalPages }, positions] = await Promise.all([
    searchApplications({
      page,
      pageSize: 20,
      search: sp.search,
      status,
      positionSlug: sp.position,
      dateFrom,
      dateTo,
      sortBy,
      sortDir,
    }),
    getAllJobPositions(),
  ]);

  const serializedItems: SerializedCareerApplication[] = items.map((application) => ({
    _id: String(application._id),
    positionSlug: application.positionSlug,
    positionTitle: application.positionTitle,
    name: application.name,
    email: application.email,
    phone: application.phone,
    coverNote: application.coverNote,
    status: application.status,
    notes: application.notes,
    resume: application.resume,
    source: application.source,
    createdAt: new Date(application.createdAt).toISOString(),
    updatedAt: new Date(application.updatedAt).toISOString(),
  }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Applicants" }]}
        title={<>Applicants</>}
        description={<>{total} application{total === 1 ? "" : "s"}</>}
        actions={<><RestoreAccountsButton /><CareersExportButton
          params={{
            search: sp.search,
            status,
            position: sp.position,
            dateFrom: sp.dateFrom,
            dateTo: sp.dateTo,
            sortBy,
            sortDir,
          }}
        /></>}
      />

      <CareerApplicationsDataTable
        items={serializedItems}
        total={total}
        page={page}
        totalPages={totalPages}
        positions={positions}
        initialSearch={sp.search ?? ""}
        initialStatus={status ?? ""}
        initialPosition={sp.position ?? ""}
        initialDateFrom={sp.dateFrom ?? ""}
        initialDateTo={sp.dateTo ?? ""}
        initialSortBy={sortBy}
        initialSortDir={sortDir}
      />
    </div>
  );
}
