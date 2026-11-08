import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchStudents } from "@/lib/products/cohort-ai/students";
import { isValidStudentStatus } from "@/lib/products/cohort-ai/constants";
import StudentsFilterBar from "./StudentsFilterBar";
import StudentsGrid, { type AdminStudentRow } from "./StudentsGrid";

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  await requireWorkspaceAccess("manage.tms.students");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidStudentStatus(sp.status) ? sp.status : undefined;
  const sortBy = sp.sortBy === "fullName" ? "fullName" : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchStudents({
    page,
    pageSize: 20,
    search: sp.search,
    status,
    sortBy,
    sortDir,
  });

  const rows: AdminStudentRow[] = items.map((s) => ({
    _id: s._id,
    studentCode: s.studentCode,
    fullName: s.fullName,
    email: s.email,
    mobile: s.mobile,
    status: s.status,
    enrollmentCount: s.enrollmentCount,
    createdAt: new Date(s.createdAt).toISOString(),
  }));

  const hasActiveFilters = Boolean(sp.search || sp.status);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Cohort AI", panel: "tms" }, { label: "Students" }]}
        title={<>Students</>}
        description={<>{total} student{total === 1 ? "" : "s"}. There is no delete for students anywhere in the app — only
          status changes — so this listing doesn&apos;t add one either.</>}
      />

      <StudentsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={<StudentsFilterBar initialSearch={sp.search ?? ""} initialStatus={status ?? ""} />}
      />
    </div>
  );
}
