import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import MyProfileEditForm from "@/components/products/talentos/MyProfileEditForm";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { getEmployee, employeeFullName } from "@/lib/products/talentos/employees";
import { masterLookups } from "@/lib/products/talentos/departments";
import { getEmploymentTypeLabel, getGenderLabel } from "@/lib/products/talentos/employee-status";
import { formatDate } from "@/lib/utils";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export default async function MyProfilePage() {
  const user = await getCurrentHrmsUser();
  const employee = (await getEmployee(user!.employeeId!))!;
  const lookups = await masterLookups();
  const p = employee.personal;
  const pr = employee.professional;

  return (
    <div className="space-y-5">
      <PanelPageHeader
        title={<>My Profile</>}
        description={<>{employee.employeeCode} · {employeeFullName(employee)}</>}
      />

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Employment (read-only)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Department" value={lookups.departmentName(pr.departmentId)} />
          <Field label="Designation" value={lookups.designationTitle(pr.designationId)} />
          <Field label="Team" value={lookups.teamName(pr.teamId)} />
          <Field label="Employment type" value={getEmploymentTypeLabel(pr.employmentType ?? undefined)} />
          <Field label="Joining date" value={pr.joiningDate ? formatDate(pr.joiningDate) : ""} />
          <Field label="Work email" value={employee.workEmail} />
          <Field label="Date of birth" value={p.dateOfBirth ? formatDate(p.dateOfBirth) : ""} />
          <Field label="Gender" value={getGenderLabel(p.gender ?? undefined)} />
        </CardContent>
      </GlassCard>

      <MyProfileEditForm
        initial={{
          phone: p.phone ?? "",
          personalEmail: p.personalEmail ?? "",
          addressLine: p.addressLine ?? "",
          city: p.city ?? "",
          state: p.state ?? "",
          postalCode: p.postalCode ?? "",
          emergencyContacts: employee.emergencyContacts,
        }}
      />
    </div>
  );
}
