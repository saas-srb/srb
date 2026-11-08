import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { Plus, Users, GraduationCap, CheckCircle2, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import StudentsDataTable from "@/components/products/cohort-ai/StudentsDataTable";
import StudentForm from "@/components/products/cohort-ai/StudentForm";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageStudents } from "@/lib/tms-roles";
import { searchStudents, countStudents, serializeStudent } from "@/lib/products/cohort-ai/students";
import { isValidStudentStatus, type StudentStatus } from "@/lib/products/cohort-ai/constants";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentTmsUser();
  const canManage = user ? canManageStudents(user) : false;

  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidStudentStatus(sp.status) ? (sp.status as StudentStatus) : undefined;
  const sortBy = (sp.sortBy as "createdAt" | "fullName" | "studentCode" | "status") || "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [result, total, active, completed, dropped] = await Promise.all([
    searchStudents({ search: sp.search, status, page, pageSize: 20, sortBy, sortDir }),
    countStudents(),
    countStudents({ status: "active" }),
    countStudents({ status: "completed" }),
    countStudents({ status: "dropped" }),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Students" }]}
        title={<>Students</>}
        description={<>{total} student{total === 1 ? "" : "s"} in the CRM.</>}
        actions={<>{canManage && (
          <StudentForm
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Student
              </Button>
            }
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Total Students" value={total} accent icon={<Users className="size-4" />} />
        <KpiCard label="Active" value={active} icon={<GraduationCap className="size-4" />} />
        <KpiCard label="Completed" value={completed} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="Dropped" value={dropped} tone={dropped > 0 ? "down" : undefined} icon={<UserMinus className="size-4" />} />
      </KpiGrid>

      <StudentsDataTable
        items={result.items.map((s) => ({ ...serializeStudent(s), enrollmentCount: s.enrollmentCount }))}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        initial={{ search: sp.search ?? "", status: sp.status ?? "" }}
      />

      {result.total === 0 && !sp.search && !sp.status && (
        <p className="text-center text-sm text-muted-foreground">
          No students yet. {canManage ? "Use “New Student” to add one directly." : "Ask a training manager."}
        </p>
      )}
    </div>
  );
}
