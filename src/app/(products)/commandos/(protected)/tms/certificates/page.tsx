import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchCertificates } from "@/lib/products/cohort-ai/certificates";
import CertificatesFilterBar from "./CertificatesFilterBar";
import CertificatesGrid, { type AdminCertificateRow } from "./CertificatesGrid";

export default async function AdminCertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.tms.certificates");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const sortBy = sp.sortBy === "issuedOn" ? "issuedOn" : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchCertificates({
    page,
    pageSize: 20,
    search: sp.search,
    sortBy,
    sortDir,
  });

  const rows: AdminCertificateRow[] = items.map((c) => ({
    _id: c._id,
    certificateNumber: c.certificateNumber,
    typeLabel: c.typeLabel,
    studentName: c.studentName,
    programName: c.programName,
    issuedOn: c.issuedOn,
    grade: c.grade,
    revoked: c.revoked,
  }));

  const hasActiveFilters = Boolean(sp.search);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Cohort AI", panel: "tms" }, { label: "Certificates" }]}
        title={<>Certificates</>}
        description={<>{total} certificate{total === 1 ? "" : "s"} issued.</>}
      />

      <CertificatesGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={<CertificatesFilterBar initialSearch={sp.search ?? ""} />}
      />
    </div>
  );
}
