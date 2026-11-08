import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Mail, Phone, MapPin, School, Users, GraduationCap, Layers, Gauge, Pencil, Plus, ExternalLink } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { StudentStatusBadge, BatchStatusBadge, ProgramCategoryBadge } from "@/components/products/cohort-ai/StatusBadges";
import StudentForm from "@/components/products/cohort-ai/StudentForm";
import AssignBatchForm from "@/components/products/cohort-ai/AssignBatchForm";
import EnrollmentControls from "@/components/products/cohort-ai/EnrollmentControls";
import StudentLoginPanel from "@/components/products/cohort-ai/StudentLoginPanel";
import OtsCandidatePanel from "@/components/products/evaliq/OtsCandidatePanel";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageStudents } from "@/lib/tms-roles";
import { getStudentOverview } from "@/lib/products/cohort-ai/student-dashboard";
import { listProgramOptions } from "@/lib/products/cohort-ai/programs";
import { listOpenBatchesForAssignment } from "@/lib/products/cohort-ai/batches";
import { loginStatusForStudent } from "@/lib/products/cohort-ai/student-auth";
import { formatDate } from "@/lib/utils";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const overview = await getStudentOverview(id);
  if (!overview) notFound();

  const [user, programs, openBatches, loginStatus] = await Promise.all([
    getCurrentTmsUser(),
    listProgramOptions(),
    listOpenBatchesForAssignment(),
    loginStatusForStudent(id),
  ]);

  const canManage = user ? canManageStudents(user) : false;
  const { student: s, enrollments, averageProgress } = overview;
  const activeEnrollments = enrollments.filter((e) => e.status === "active").length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Students", href: "/cohort-ai/students" }, { label: s.fullName }]}
        title={<><span className="inline-flex flex-wrap items-center gap-2">{s.fullName}<StudentStatusBadge status={s.status} /></span></>}
        description={<span className="font-mono">{s.studentCode}</span>}
        actions={<>{canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <AssignBatchForm
              studentId={s._id}
              programs={programs.map((p) => ({ _id: p._id, name: p.name }))}
              batches={openBatches}
              trigger={
                <Button type="button" size="sm">
                  <Plus className="size-3.5" data-icon="inline-start" />
                  Assign to Batch
                </Button>
              }
            />
            <StudentForm
              student={s}
              trigger={
                <Button type="button" variant="outline" size="sm">
                  <Pencil className="size-3.5" data-icon="inline-start" />
                  Edit
                </Button>
              }
            />
          </div>
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Enrolments" value={enrollments.length} accent icon={<Layers className="size-4" />} />
        <KpiCard label="Active" value={activeEnrollments} icon={<GraduationCap className="size-4" />} />
        <KpiCard label="Avg Progress" value={averageProgress} suffix="%" icon={<Gauge className="size-4" />} />
        <KpiCard label="Portal" value={loginStatus.hasLogin ? "Active" : "None"} icon={<Users className="size-4" />} />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <CardHeader><CardTitle>Enrolments</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {enrollments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Not enrolled in any batch yet.{" "}
                {canManage ? "Use “Assign to Batch”." : null}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Program / Batch</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>{canManage ? "Manage" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.map((e) => (
                    <TableRow key={e.enrollmentId}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Link href={`/cohort-ai/programs/${e.programId}`} className="font-medium hover:underline">{e.programName}</Link>
                          <ProgramCategoryBadge category={e.programCategory} />
                        </div>
                        <Link href={`/cohort-ai/batches/${e.batchId}`} className="text-xs text-muted-foreground hover:underline">
                          {e.batchName} ({e.batchCode})
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {e.startDate ? formatDate(e.startDate) : "TBD"}
                        {e.timing ? <div>{e.timing}</div> : null}
                        {e.mentorName ? <div>Mentor: {e.mentorName}</div> : null}
                      </TableCell>
                      <TableCell className="w-36"><ProgressBar value={e.progressPercent} /></TableCell>
                      <TableCell>
                        {canManage ? (
                          <EnrollmentControls
                            studentId={s._id}
                            batchId={e.batchId}
                            status={e.status}
                            progressPercent={e.progressPercent}
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <StudentStatusBadge status={e.status} />
                            <BatchStatusBadge status={e.batchStatus} />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard>
            <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="size-4 shrink-0 text-muted-foreground" />
                <span>{s.email || "No email"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="size-4 shrink-0 text-muted-foreground" />
                <span>{s.mobile || "No phone"}</span>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>{s.address || "No address"}</span>
              </div>
              <div className="flex items-start gap-2">
                <School className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>
                  {s.education.college || "College —"}
                  {s.education.branch ? `, ${s.education.branch}` : ""}
                  {s.education.graduationYear ? ` (${s.education.graduationYear})` : ""}
                  {s.education.university ? <div className="text-xs text-muted-foreground">{s.education.university}</div> : null}
                </span>
              </div>
              {(s.guardian.name || s.guardian.phone) && (
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    {s.guardian.name || "Guardian"}
                    {s.guardian.relation ? ` (${s.guardian.relation})` : ""}
                    {s.guardian.phone ? ` · ${s.guardian.phone}` : ""}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {s.links.resumeUrl && (
                  <a href={s.links.resumeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    Resume <ExternalLink className="size-3" />
                  </a>
                )}
                {s.links.linkedin && (
                  <a href={s.links.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    LinkedIn <ExternalLink className="size-3" />
                  </a>
                )}
                {s.links.github && (
                  <a href={s.links.github} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    GitHub <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              {s.notes && <p className="border-t border-border/60 pt-2 text-xs text-muted-foreground">{s.notes}</p>}
            </CardContent>
          </GlassCard>

          {canManage && (
            <StudentLoginPanel studentId={s._id} defaultEmail={s.email ?? ""} status={loginStatus} />
          )}

          <OtsCandidatePanel kind="student" id={s._id} title="Tests & Exams" />
        </div>
      </div>
    </div>
  );
}
