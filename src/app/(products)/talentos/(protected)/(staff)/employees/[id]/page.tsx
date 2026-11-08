import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, Calendar, Building2, MapPin, ShieldAlert, Pencil } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { buttonVariants } from "@/components/ui/button";
import EmployeeStatusBadge from "@/components/products/talentos/EmployeeStatusBadge";
import LeaveStatusBadge from "@/components/products/talentos/LeaveStatusBadge";
import Tabs from "@/components/products/talentos/Tabs";
import PayrollForm from "@/components/products/talentos/PayrollForm";
import EmployeeStatusControl from "@/components/products/talentos/EmployeeStatusControl";
import EmployeeDangerZone from "@/components/products/talentos/EmployeeDangerZone";
import AttendanceCalendar from "@/components/products/talentos/AttendanceCalendar";
import LeaveBalances from "@/components/products/talentos/LeaveBalances";
import FileLeaveSheet from "@/components/products/talentos/FileLeaveSheet";
import EmployeeDocumentsManager from "@/components/products/talentos/EmployeeDocumentsManager";
import SalaryRevisionManager from "@/components/products/talentos/SalaryRevisionManager";
import CreatePortalLoginPanel from "@/components/products/talentos/CreatePortalLoginPanel";
import BankAccountsManager from "@/components/products/talentos/BankAccountsManager";
import OtsCandidatePanel from "@/components/products/evaliq/OtsCandidatePanel";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManageEmployees, canManagePayroll, canApproveLeave, canRunPayroll, canManageEmployeeDocuments } from "@/lib/hrms-roles";
import { getEmployee, employeeFullName } from "@/lib/products/talentos/employees";
import { masterLookups } from "@/lib/products/talentos/departments";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { getPayrollProfile, serializePayrollProfile } from "@/lib/products/talentos/payroll";
import { getPayrollConfig } from "@/lib/products/talentos/payroll-config";
import { listBankAccounts, serializeBankAccount } from "@/lib/products/talentos/bank-accounts";
import { isEncryptionConfigured } from "@/lib/products/talentos/crypto";
import { listRevisions, serializeRevision } from "@/lib/products/talentos/salary-revisions";
import { listDocuments, serializeDocument } from "@/lib/products/talentos/documents";
import { loginStatusForEmployee } from "@/lib/products/talentos/employee-auth";
import { recentActivityFor } from "@/lib/products/talentos/audit";
import { getEmployeeMonth } from "@/lib/products/talentos/attendance";
import { getBalances, getEmployeeLeaveHistory, listLeaveTypes, currentYear } from "@/lib/products/talentos/leave";
import { todayDateString } from "@/lib/products/talentos/settings";
import {
  getEmploymentTypeLabel,
  getGenderLabel,
} from "@/lib/products/talentos/employee-status";
import { formatDate, formatDateTime } from "@/lib/utils";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export default async function EmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentHrmsUser();
  const employee = await getEmployee(id);
  if (!employee) notFound();

  const year = currentYear();
  const attMonth = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayDateString().slice(0, 7);

  const [lookups, managers, payroll, activity, attMonthData, balances, leaveHistory, leaveTypes, revisions, documents, loginStatus, bankAccounts] = await Promise.all([
    masterLookups(),
    listEmployeeOptions(),
    getPayrollProfile(id),
    recentActivityFor("employee", id, 30),
    getEmployeeMonth(id, attMonth),
    getBalances(id, year),
    getEmployeeLeaveHistory(id, 30),
    listLeaveTypes(),
    listRevisions(id),
    listDocuments(id),
    loginStatusForEmployee(id),
    canManagePayroll(user ?? { roles: [] }) ? listBankAccounts(id) : Promise.resolve([]),
  ]);

  const canEdit = !!user && canManageEmployees(user);
  const canPayroll = !!user && canManagePayroll(user);
  const canRevise = !!user && canRunPayroll(user);
  const canDocs = !!user && canManageEmployeeDocuments(user);
  const canLeave = !!user && canApproveLeave(user);
  const managerName = managers.find((m) => m._id === employee.professional.reportingManagerId)?.name ?? "—";
  const name = employeeFullName(employee);
  const p = employee.personal;
  const pr = employee.professional;

  const overviewTab = (
    <div className="grid gap-4 lg:grid-cols-2">
      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Personal</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Field label="Date of birth" value={p.dateOfBirth ? formatDate(p.dateOfBirth) : ""} />
          <Field label="Gender" value={getGenderLabel(p.gender ?? undefined)} />
          <Field label="Marital status" value={p.maritalStatus} />
          <Field label="Personal email" value={p.personalEmail} />
          <Field label="Personal phone" value={p.phone} />
          <Field label="Address" value={[p.addressLine, p.city, p.state, p.postalCode].filter(Boolean).join(", ")} />
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Professional</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Field label="Department" value={lookups.departmentName(pr.departmentId)} />
          <Field label="Designation" value={lookups.designationTitle(pr.designationId)} />
          <Field label="Team" value={lookups.teamName(pr.teamId)} />
          <Field label="Reporting manager" value={managerName} />
          <Field label="Employment type" value={getEmploymentTypeLabel(pr.employmentType ?? undefined)} />
          <Field label="Work location" value={pr.workLocation ? pr.workLocation[0].toUpperCase() + pr.workLocation.slice(1) : ""} />
          <Field label="Joining date" value={pr.joiningDate ? formatDate(pr.joiningDate) : ""} />
          <Field label="Probation ends" value={pr.probationEndDate ? formatDate(pr.probationEndDate) : ""} />
          <Field label="Relieving date" value={pr.relievingDate ? formatDate(pr.relievingDate) : ""} />
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false} className="lg:col-span-2">
        <CardHeader><CardTitle>Emergency Contacts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {employee.emergencyContacts.length === 0 && <p className="text-sm text-muted-foreground">No emergency contacts on file.</p>}
          {employee.emergencyContacts.map((c, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-border/60 p-3 text-sm">
              <ShieldAlert className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground">{c.relationship}</span>
              <span className="ml-auto text-muted-foreground">{c.phone}</span>
            </div>
          ))}
        </CardContent>
      </GlassCard>

      {employee.recruitment && (
        <GlassCard interactive={false} className="lg:col-span-2">
          <CardHeader><CardTitle>Recruitment History</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              Converted from a job application for <span className="font-medium">{employee.recruitment.positionTitle ?? "a role"}</span>
              {" "}on {formatDate(employee.recruitment.convertedAt)}.
            </p>
            <Link href="/talentos/recruitment" className="text-xs text-primary hover:underline">
              View recruitment pipeline
            </Link>
          </CardContent>
        </GlassCard>
      )}
    </div>
  );

  const salaryTab = canPayroll || payroll ? (
    <div className="space-y-4">
      <PayrollForm employeeId={id} profile={payroll ? serializePayrollProfile(payroll) : null} canEdit={canPayroll} companyPfMode={(await getPayrollConfig()).pfDefaultMode} />
      {canPayroll && (
        <BankAccountsManager
          employeeId={id}
          encryptionReady={isEncryptionConfigured()}
          accounts={bankAccounts.map(serializeBankAccount).map((a) => ({
            _id: a._id,
            accountHolderName: a.accountHolderName,
            bankName: a.bankName,
            branch: a.branch,
            accountType: a.accountType,
            accountNumberMasked: a.accountNumberMasked,
            ifsc: a.ifsc,
            hasUpi: a.hasUpi,
            isPrimary: a.isPrimary,
            verificationStatus: a.verificationStatus,
            verifiedAt: a.verifiedAt,
            verificationNote: a.verificationNote,
          }))}
        />
      )}
      {canRevise && (
        <SalaryRevisionManager
          employeeId={id}
          revisions={revisions.map(serializeRevision).map((r) => ({
            _id: r._id,
            effectiveFrom: r.effectiveFrom,
            basic: r.basic,
            da: r.da,
            hra: r.hra,
            allowances: r.allowances,
            deductions: r.deductions,
            employerNps: r.employerNps,
            reason: r.reason,
            createdAt: r.createdAt,
          }))}
          current={payroll ? { basic: payroll.basic, da: payroll.da, hra: payroll.hra, allowances: payroll.allowances, deductions: payroll.deductions, employerNps: payroll.employerNps } : null}
        />
      )}
      {canEdit && (
        <CreatePortalLoginPanel
          employeeId={id}
          workEmail={employee.workEmail}
          status={{
            hasLogin: loginStatus.hasLogin,
            email: loginStatus.email,
            mustChangePassword: loginStatus.mustChangePassword,
            lastLoginAt: loginStatus.lastLoginAt,
          }}
        />
      )}
    </div>
  ) : (
    <GlassCard interactive={false}>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        You do not have permission to view payroll details.
      </CardContent>
    </GlassCard>
  );

  const activityTab = (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle>Activity Timeline</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {activity.length === 0 && <p className="text-sm text-muted-foreground">No recorded activity yet.</p>}
        {activity.map((a) => (
          <div key={a._id} className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-sm">
            <span className="mt-1 size-2 shrink-0 rounded-full bg-primary/70" />
            <div className="min-w-0">
              <p className="text-foreground">
                <span className="font-medium capitalize">{a.action.replace(/_/g, " ")}</span>
                {a.summary ? ` — ${a.summary}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {a.actorEmail ?? "system"} · {formatDateTime(a.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </GlassCard>
  );

  const attendanceTab = (
    <GlassCard interactive={false}>
      <CardHeader><CardTitle>Attendance — {name}</CardTitle></CardHeader>
      <CardContent>
        <AttendanceCalendar month={attMonth} cells={attMonthData.cells} summary={attMonthData.summary} />
      </CardContent>
    </GlassCard>
  );

  const leaveTab = (
    <div className="space-y-4">
      <GlassCard interactive={false}>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{year} Balances</CardTitle>
          {canLeave && (
            <FileLeaveSheet
              employees={[{ _id: id, name, employeeCode: employee.employeeCode }]}
              leaveTypes={leaveTypes.map((t) => ({ code: t.code, label: t.label }))}
              fixedEmployeeId={id}
              triggerVariant="outline"
            />
          )}
        </CardHeader>
        <CardContent>
          <LeaveBalances employeeId={id} year={year} balances={balances.map((b) => ({ ...b }))} canEditAllocation={canEdit} />
        </CardContent>
      </GlassCard>
      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Request History</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {leaveHistory.length === 0 && <p className="text-sm text-muted-foreground">No leave requests.</p>}
          {leaveHistory.map((r) => (
            <div key={r._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{r.leaveTypeLabel} · {r.days} day{r.days === 1 ? "" : "s"}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(r.startDate)}{r.startDate !== r.endDate ? ` – ${formatDate(r.endDate)}` : ""}
                  {r.reason ? ` · ${r.reason}` : ""}
                </p>
              </div>
              <LeaveStatusBadge status={r.status} />
            </div>
          ))}
        </CardContent>
      </GlassCard>
    </div>
  );

  return (
    <div className="space-y-4">

      <PanelPageHeader
        leading={
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-accent text-lg font-bold text-white shadow-sm">
            {employee.firstName[0]}
            {employee.lastName[0]}
          </div>
        }
        title={<>{name}</>}
        description={<><span className="font-mono">{employee.employeeCode}</span> · {lookups.designationTitle(pr.designationId)} · {lookups.departmentName(pr.departmentId)}</>}
        actions={
          <>
            <EmployeeStatusBadge status={employee.status} />
            {canEdit && (
              <Link href={`/talentos/employees/${id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Pencil className="size-3.5" data-icon="inline-start" />
                Edit
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
        <section className="min-w-0 rounded-3xl border border-border/60 bg-muted/70 p-4 shadow-sm sm:p-5 dark:bg-[color-mix(in_oklch,var(--background)_82%,black)]">
          <Tabs
            initial={sp.tab}
            syncParam="tab"
            tabs={[
              { key: "overview", label: "Overview", content: overviewTab },
              { key: "salary", label: "Salary & Bank", content: salaryTab },
              { key: "attendance", label: "Attendance", content: attendanceTab },
              { key: "leave", label: "Leave", content: leaveTab },
              { key: "assessments", label: "Assessments", content: <OtsCandidatePanel kind="employee" id={id} title="Assessments & Certifications" /> },
              {
                key: "documents",
                label: "Documents",
                content: canDocs ? (
                  <EmployeeDocumentsManager
                    employeeId={id}
                    documents={documents.map(serializeDocument).map((d) => ({
                      _id: d._id,
                      category: d.category,
                      title: d.title,
                      filename: d.filename,
                      contentType: d.contentType,
                      size: d.size,
                      issuedDate: d.issuedDate,
                      expiryDate: d.expiryDate,
                      version: d.version,
                      uploadedByRole: d.uploadedByRole,
                      createdAt: d.createdAt,
                    }))}
                  />
                ) : (
                  <GlassCard interactive={false}>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                      You do not have permission to manage documents.
                    </CardContent>
                  </GlassCard>
                ),
              },
              { key: "activity", label: "Activity", content: activityTab },
            ]}
          />
        </section>

        <aside className="space-y-4 rounded-3xl border border-border/60 bg-muted/70 p-4 shadow-sm sm:p-5 dark:bg-[color-mix(in_oklch,var(--background)_82%,black)] lg:sticky lg:top-0">
          <GlassCard interactive={false}>
            <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="size-4 shrink-0 text-muted-foreground" />
                <a href={`mailto:${employee.workEmail}`} className="truncate hover:underline">{employee.workEmail}</a>
              </div>
              {p.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="size-4 shrink-0 text-muted-foreground" />
                  <a href={`tel:${p.phone}`} className="hover:underline">{p.phone}</a>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span>{lookups.departmentName(pr.departmentId)}</span>
              </div>
              {(p.city || p.state) && (
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 shrink-0 text-muted-foreground" />
                  <span>{[p.city, p.state].filter(Boolean).join(", ")}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Calendar className="size-4 shrink-0 text-muted-foreground" />
                <span>Added {formatDate(employee.createdAt)}</span>
              </div>
            </CardContent>
          </GlassCard>

          {canEdit && (
            <GlassCard interactive={false}>
              <CardHeader><CardTitle>Status</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <EmployeeStatusControl
                  employeeId={id}
                  current={employee.status}
                  currentRelievingDate={pr.relievingDate}
                />
                <div className="border-t border-border/60 pt-3">
                  <EmployeeDangerZone employeeId={id} name={name} />
                </div>
              </CardContent>
            </GlassCard>
          )}
        </aside>
      </div>
    </div>
  );
}
