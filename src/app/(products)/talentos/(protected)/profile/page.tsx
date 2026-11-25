import { hiddenProducts } from "@/lib/platform/products/visible";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Tabs from "@/components/products/talentos/Tabs";
import MyProfileEditForm from "@/components/products/talentos/MyProfileEditForm";
import EmployeeSignedDocuments from "@/components/products/talentos/EmployeeSignedDocuments";
import MyDocuments from "@/components/products/talentos/MyDocuments";
import { notFound } from "next/navigation";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { hrCan } from "@/lib/talentos-access";
import { getEmployee, employeeFullName } from "@/lib/products/talentos/employees";
import { masterLookups } from "@/lib/products/talentos/departments";
import { listDocuments, serializeDocument } from "@/lib/products/talentos/documents";
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

/** The person's own record: profile (read-only employment details, editable contact) and documents. One normal page for everyone given TalentOS. */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = (await getCurrentHrmsUser())!; // the layout has already checked profile.view
  if (!user.employeeId) notFound();
  const employee = await getEmployee(user.employeeId);
  if (!employee) notFound();
  const sp = await searchParams;
  const showDocs = hrCan(user, "documents.view");
  const tab = sp.tab === "documents" && showDocs ? "documents" : "profile";
  const lookups = await masterLookups();
  const p = employee.personal;
  const pr = employee.professional;
  const docs = showDocs ? (await listDocuments(user.employeeId)).map(serializeDocument) : [];

  return (
    <div className="space-y-5">
      <PanelPageHeader title={<>My Profile</>} description={<>{employee.employeeCode} · {employeeFullName(employee)}</>} />
      <PanelListFilters>
        <Tabs
          initial={tab}
          syncParam="tab"
          tabs={[
            {
              key: "profile",
              label: "Profile",
              content: (
                <div className="space-y-5">
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
                    canEdit={hrCan(user, "profile.edit")}
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
              ),
            },
            ...(showDocs ? [{
              key: "documents",
              label: "Documents",
              content: (
                <div className="space-y-5">
                  {!(await hiddenProducts()).has("lpms") && <EmployeeSignedDocuments employeeId={user.employeeId} title="My signed documents" />}
                  <MyDocuments
                    canUpload={hrCan(user, "documents.upload")}
                    documents={docs.map((d) => ({ _id: d._id, category: d.category, title: d.title, filename: d.filename, contentType: d.contentType, size: d.size, expiryDate: d.expiryDate, version: d.version, uploadedByRole: d.uploadedByRole, createdAt: d.createdAt }))}
                  />
                </div>
              ),
            }] : []),
          ]}
        />
      </PanelListFilters>
    </div>
  );
}
