import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchApplications, getAllJobPositions } from "@/lib/career-applications";
import { isValidCareerApplicationStatus } from "@/lib/career-application-status";
import { nextInterviewFor } from "@/lib/products/clientos/interviews";
import { listOffers } from "@/lib/products/talentos/offers";
import ApplicantsFilterBar from "./ApplicantsFilterBar";
import ApplicantsGrid, { type AdminApplicantRow } from "./ApplicantsGrid";

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function AdminApplicantsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    positionSlug?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  await requireWorkspaceAccess("manage.careers.applicants");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidCareerApplicationStatus(sp.status) ? sp.status : undefined;
  const dateFrom = parseDateParam(sp.dateFrom);
  const dateTo = parseDateParam(sp.dateTo, true);
  const sortBy = sp.sortBy === "name" ? "name" : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [{ items, total, totalPages }, positions, offers] = await Promise.all([
    searchApplications({
      page,
      pageSize: 20,
      search: sp.search,
      status,
      positionSlug: sp.positionSlug,
      dateFrom,
      dateTo,
      sortBy,
      sortDir,
    }),
    getAllJobPositions(),
    listOffers(),
  ]);

  const offerByApplicationId = new Map(offers.map((o) => [o.applicationId, o]));
  const nextInterviews = await Promise.all(items.map((app) => nextInterviewFor(String(app._id))));

  const rows: AdminApplicantRow[] = items.map((app, i) => {
    const offer = offerByApplicationId.get(String(app._id));
    const interview = nextInterviews[i];
    return {
      _id: String(app._id),
      name: app.name,
      email: app.email,
      phone: app.phone,
      positionTitle: app.positionTitle,
      status: app.status,
      hasResume: Boolean(app.resume),
      createdAt: new Date(app.createdAt).toISOString(),
      offerStatus: offer?.status ?? null,
      nextInterview: interview
        ? { title: interview.title, mode: interview.mode, status: interview.status, scheduledAt: interview.scheduledAt }
        : null,
    };
  });

  const hasActiveFilters = Boolean(sp.search || sp.status || sp.positionSlug || sp.dateFrom || sp.dateTo);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Careers" }, { label: "Applicants" }]}
        title={<>Job Applicants</>}
        description={<>{total} applicant{total === 1 ? "" : "s"}. Interview Schedule and Offer Status come from real linked
          records (portal interviews, TalentOS offers) — not every applicant has either yet.</>}
      />

      <ApplicantsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={
          <ApplicantsFilterBar
            initialSearch={sp.search ?? ""}
            initialStatus={status ?? ""}
            initialPosition={sp.positionSlug ?? ""}
            positions={positions}
          />
        }
      />
    </div>
  );
}
